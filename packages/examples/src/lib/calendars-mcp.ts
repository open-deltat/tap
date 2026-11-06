import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ALLOWED_SLOT_MINUTES } from "./bookable-service";
import { calendarGuide } from "./calendar-guide";
import { MAX_BUFFER_MINUTES, MAX_CALENDARS_PER_OWNER, MAX_CAPACITY, type MyCalendar, type MyCalendarsService } from "./my-calendars";
import { DEFAULT_DISPLAY, DISPLAY_NAMES, DISPLAYS } from "./calendar-displays";
import type { WeekHours } from "../examples/builder/schedule";
import type { MeetingsCaller } from "./meetings-mcp";

// The calendar tools on the hosted server: the caller's own calendars, creating one (the only place
// a calendar is created; the website shows them), and the guide to modelling a business as calendars.

const ok = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
const refused = (message: string) => ({
  content: [{ type: "text" as const, text: JSON.stringify({ error: "REFUSED", message }) }],
  isError: true,
});

export const CALENDAR_INSTRUCTIONS =
  "Create calendars with create_calendar and find yours with list_my_calendars. Before creating calendars for a business, call how_to_model_calendars.";

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

const Block = z.object({
  from: z.string().max(5).describe("Opening time, HH:MM in the calendar's time zone, e.g. 09:00"),
  to: z.string().max(5).describe("Closing time, HH:MM, e.g. 17:00"),
});
const Day = z.array(Block).max(4).optional();
const WeeklyHours = z
  .object({ sunday: Day, monday: Day, tuesday: Day, wednesday: Day, thursday: Day, friday: Day, saturday: Day })
  .describe("Opening hours per weekday; leave a day out to keep it closed. Defaults to monday to friday, 09:00 to 17:00");

/** The tool's day names to the week shape the owned-calendar path stores (0 = Sunday). */
const toWeek = (hours: z.infer<typeof WeeklyHours>): WeekHours =>
  Object.fromEntries(
    DAYS.flatMap((day, dow) => {
      const blocks = hours[day];
      return blocks ? [[dow, blocks.map((b) => ({ start: b.from, end: b.to }))]] : [];
    })
  );

const describeCalendar = (c: MyCalendar) => ({
  calendar_id: c.id,
  name: c.name,
  timezone: c.timezone,
  slot_minutes: c.slotMinutes,
  takes_meeting_requests: c.takesMeetingRequests,
  capacity: c.capacity,
  buffer_minutes: c.bufferMinutes,
  display: c.display,
  booking_link: c.bookingLink,
});

const Display = z
  .enum(DISPLAY_NAMES)
  .describe(`How the public booking page looks: ${DISPLAY_NAMES.map((d) => `${d} (${DISPLAYS[d].pick})`).join("; ")}`);

export function registerCalendarTools(server: McpServer, calendars: MyCalendarsService, caller: MeetingsCaller): void {
  server.registerTool(
    "list_my_calendars",
    {
      title: "My calendars",
      description:
        "Use this when you own calendars and need a calendar_id, for create_booking_pass, list_booking_passes or list_meeting_requests: it lists the calendars you own, each with its name, time zone, slot length (slot_minutes), how many bookings can overlap (capacity), turnover after each booking (buffer_minutes), whether it takes meeting requests, how its booking page looks (display), and its public booking_link. Only your own calendars are listed; anyone else gets an empty list.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: {},
    },
    async () => {
      const listed = await calendars.list(caller.principalId);
      return listed.ok ? ok({ calendars: listed.value.map(describeCalendar) }) : refused(listed.error);
    }
  );

  server.registerTool(
    "create_calendar",
    {
      title: "Create a calendar",
      description:
        `Use this to create a calendar for the signed-in person: one thing that can be booked, such as a person, a room, a table or a machine. It belongs to their account; nobody else can see or change it. Give it a name and an IANA time zone; opening hours default to monday to friday, 09:00 to 17:00. For identical places that can be booked at the same time (a class of 12, five bikes), set capacity; for time to reset after each booking, set buffer_minutes. For a business, call how_to_model_calendars first. It returns the calendar as list_my_calendars shows it, with its booking_link to share. Next: share the booking_link, or create_booking_pass to let one person's agent book directly. One account can have up to ${MAX_CALENDARS_PER_OWNER} calendars.`,
      inputSchema: {
        name: z.string().max(60).describe("What people see, e.g. \"Consultations\" or \"Tables for 4\"; at most 60 characters"),
        timezone: z.string().max(64).describe("IANA time zone the hours are in, e.g. Europe/Berlin or America/New_York"),
        slot_minutes: z
          .number()
          .int()
          .optional()
          .describe(`Length of one booking: ${ALLOWED_SLOT_MINUTES.join(", ")} minutes. Defaults to 30`),
        weekly_hours: WeeklyHours.optional(),
        takes_meeting_requests: z
          .boolean()
          .optional()
          .describe("true: people ask and nothing is booked until the owner approves. Defaults to false: people book free slots directly"),
        capacity: z.number().int().optional().describe(`How many bookings can overlap, 1 to ${MAX_CAPACITY}. Defaults to 1`),
        buffer_minutes: z.number().int().optional().describe(`Minutes kept free after each booking, 0 to ${MAX_BUFFER_MINUTES}. Defaults to 0`),
        display: Display.optional().describe(`How the public booking page looks. Defaults to ${DEFAULT_DISPLAY}; how_to_model_calendars lists the views`),
      },
    },
    async ({ name, timezone, slot_minutes, weekly_hours, takes_meeting_requests, capacity, buffer_minutes, display }) => {
      const made = await calendars.create(caller.principalId, {
        name,
        timezone,
        slotMinutes: slot_minutes,
        week: weekly_hours ? toWeek(weekly_hours) : undefined,
        takesMeetingRequests: takes_meeting_requests,
        capacity,
        bufferMinutes: buffer_minutes,
        display,
      });
      if (!made.ok) return refused(made.error);
      return ok({
        ...describeCalendar(made.value),
        next: "Share the booking_link, or call create_booking_pass with this calendar_id to let one person's agent book directly.",
      });
    }
  );

  server.registerTool(
    "set_calendar_display",
    {
      title: "Change how a calendar's booking page looks",
      description: `Use this when you own a calendar and want its public booking page (booking_link) to show a different view. The views are: ${DISPLAY_NAMES.join(
        ", "
      )}; how_to_model_calendars says which example each one is and when to pick it. A view that cannot show this calendar is refused with the reason. Only the calendar's owner can change it.`,
      inputSchema: { calendar_id: z.string().max(64).describe("The calendar's id; list_my_calendars shows yours"), display: Display },
    },
    async ({ calendar_id, display }) => {
      const set = await calendars.setDisplay(caller.principalId, calendar_id, display);
      return set.ok ? ok(describeCalendar(set.value)) : refused(set.error);
    }
  );

  server.registerTool(
    "how_to_model_calendars",
    {
      title: "How to model calendars",
      description:
        "Use this before creating calendars for a business or anything bigger than one person's diary: a short guide to what a calendar is, when to use separate calendars or capacity, turnover, opening hours and time zones, meeting requests and booking passes, how calendars are kept apart between accounts, and worked examples (restaurant, gym class, a person's diary, clinic, equipment rental) as the exact create_calendar calls, each marked with whether it works end to end today.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: {},
    },
    async () => ok(calendarGuide())
  );
}
