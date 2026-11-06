import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ALLOWED_SLOT_MINUTES } from "./bookable-service";
import { calendarGuide } from "./calendar-guide";
import { MAX_BUFFER_MINUTES, MAX_CALENDARS_PER_OWNER, MAX_CAPACITY, type MyCalendar, type MyCalendarsService } from "./my-calendars";
import { DEFAULT_DISPLAY, DISPLAY_NAMES, DISPLAYS } from "./calendar-displays";
import type { WeekHours } from "../examples/builder/schedule";
import type { MeetingsCaller } from "./meetings-mcp";

// The calendar tools on the hosted server: the caller's own calendars, and creating, changing and
// deleting them (the only place that happens; the website shows them), plus the guide to modelling a
// business as calendars.

const ok = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
const refused = (message: string) => ({
  content: [{ type: "text" as const, text: JSON.stringify({ error: "REFUSED", message }) }],
  isError: true,
});

export const CALENDAR_INSTRUCTIONS =
  "Create calendars with create_calendar, change them with update_calendar, delete them with delete_calendar, and find yours with list_my_calendars. Before creating calendars for a business, call how_to_model_calendars.";

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

const Block = z.object({
  from: z.string().max(5).describe("Opening time, HH:MM in the calendar's time zone, e.g. 09:00"),
  to: z.string().max(5).describe("Closing time, HH:MM, after from, e.g. 17:00"),
});
const Day = z.array(Block).max(4).optional();
const WeeklyHours = z
  .object({ sunday: Day, monday: Day, tuesday: Day, wednesday: Day, thursday: Day, friday: Day, saturday: Day })
  .describe("Opening hours per weekday, blocks not overlapping; leave a day out to keep it closed");

/** The tool's day names to the week shape the owned-calendar path stores (0 = Sunday). */
const toWeek = (hours: z.infer<typeof WeeklyHours>): WeekHours =>
  Object.fromEntries(
    DAYS.flatMap((day, dow) => {
      const blocks = hours[day];
      return blocks ? [[dow, blocks.map((b) => ({ start: b.from, end: b.to }))]] : [];
    })
  );

/** The stored week back as the tool's day names, so an agent reads its setup the way it wrote it. */
const fromWeek = (week: WeekHours) =>
  Object.fromEntries(
    DAYS.flatMap((day, dow) => {
      const blocks = week[dow];
      return blocks?.length ? [[day, blocks.map((b) => ({ from: b.start, to: b.end }))]] : [];
    })
  );

const describeCalendar = (c: MyCalendar) => ({
  calendar_id: c.id,
  name: c.name,
  timezone: c.timezone,
  weekly_hours: fromWeek(c.week),
  slot_minutes: c.slotMinutes,
  takes_meeting_requests: c.takesMeetingRequests,
  capacity: c.capacity,
  buffer_minutes: c.bufferMinutes,
  display: c.display,
  booking_link: c.bookingLink,
  created_at: new Date(c.createdAt).toISOString(),
});

const Display = z
  .enum(DISPLAY_NAMES)
  .describe(`How the public booking page looks: ${DISPLAY_NAMES.map((d) => `${d} (${DISPLAYS[d].pick})`).join("; ")}`);

const CalendarId = z.string().max(64).describe("The calendar's id; list_my_calendars shows yours");
const SlotMinutes = z.number().int().describe(`Length of one booking: ${ALLOWED_SLOT_MINUTES.join(", ")} minutes`);
const Capacity = z
  .number()
  .int()
  .describe(`How many bookings can overlap, 1 to ${MAX_CAPACITY}. For N identical tables or places, capacity = N`);
const BufferMinutes = z.number().int().describe(`Minutes kept free after each booking, 0 to ${MAX_BUFFER_MINUTES}`);
const TakesRequests = z
  .boolean()
  .describe("true: people ask and nothing is booked until the owner approves. false: people book free slots directly");

export function registerCalendarTools(server: McpServer, calendars: MyCalendarsService, caller: MeetingsCaller): void {
  server.registerTool(
    "list_my_calendars",
    {
      title: "My calendars",
      description:
        "Use this when you own calendars and need a calendar_id (for create_booking_pass, list_meeting_requests, update_calendar or delete_calendar), or want to read back how one is set up: it lists the calendars you own, each with its name, time zone, weekly_hours, slot length (slot_minutes), how many bookings can overlap (capacity), turnover after each booking (buffer_minutes), whether it takes meeting requests, how its booking page looks (display), its public booking_link, and when it was created. Only your own calendars are listed; anyone else gets an empty list.",
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
        `Use this to create a calendar for the signed-in person: one thing that can be booked, such as a person, a room, a table or a machine. It belongs to their account; nobody else can see or change it. Give it a name and a place-based time zone; opening hours default to monday to friday, 09:00 to 17:00. For identical places that can be booked at the same time (a class of 12, five bikes), set capacity; for time to reset after each booking, set buffer_minutes. For a business, call how_to_model_calendars first. It returns the calendar as list_my_calendars shows it, with its booking_link to share. Next: share the booking_link, or create_booking_pass to let one person's agent book directly. One account can have up to ${MAX_CALENDARS_PER_OWNER} calendars; change one with update_calendar, remove one with delete_calendar.`,
      inputSchema: {
        name: z.string().max(60).describe("What people see, e.g. \"Consultations\" or \"Tables for 4\"; at most 60 characters"),
        timezone: z.string().max(64).describe("Place-based IANA time zone the hours are in, e.g. Europe/Berlin or America/New_York, or UTC"),
        slot_minutes: SlotMinutes.optional().describe(`Length of one booking: ${ALLOWED_SLOT_MINUTES.join(", ")} minutes. Defaults to 30`),
        weekly_hours: WeeklyHours.optional(),
        takes_meeting_requests: TakesRequests.optional(),
        capacity: Capacity.optional(),
        buffer_minutes: BufferMinutes.optional(),
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
    "update_calendar",
    {
      title: "Change a calendar",
      description:
        "Use this when you own a calendar and want to change its name, weekly hours, slot length, places at the same time (capacity), turnover (buffer_minutes) or whether it takes meeting requests. Pass only what changes. Bookings already made stay booked, even outside new hours. Fewer places or longer turnover is refused while the calendar has future bookings, because they might no longer fit. Only the calendar's owner can change it; it returns the calendar as list_my_calendars shows it.",
      inputSchema: {
        calendar_id: CalendarId,
        name: z.string().max(60).optional().describe("The new name; at most 60 characters"),
        weekly_hours: WeeklyHours.optional().describe("The whole new week: it replaces the old hours. Days left out are closed"),
        slot_minutes: SlotMinutes.optional(),
        capacity: Capacity.optional(),
        buffer_minutes: BufferMinutes.optional(),
        takes_meeting_requests: TakesRequests.optional(),
      },
    },
    async ({ calendar_id, name, weekly_hours, slot_minutes, capacity, buffer_minutes, takes_meeting_requests }) => {
      const updated = await calendars.update(caller.principalId, calendar_id, {
        name,
        week: weekly_hours ? toWeek(weekly_hours) : undefined,
        slotMinutes: slot_minutes,
        capacity,
        bufferMinutes: buffer_minutes,
        takesMeetingRequests: takes_meeting_requests,
      });
      return updated.ok ? ok(describeCalendar(updated.value)) : refused(updated.error);
    }
  );

  server.registerTool(
    "delete_calendar",
    {
      title: "Delete a calendar",
      description:
        "Use this when you own a calendar that should go, for example one created by mistake. It is refused while the calendar has future bookings (the answer says how many), so nobody's booking disappears; those are cancelled on the dashboard first. Deleting it revokes its live booking passes, takes its booking page down, and frees a place under the account's calendar limit. It cannot be undone. Only the calendar's owner can delete it.",
      annotations: { destructiveHint: true },
      inputSchema: { calendar_id: CalendarId },
    },
    async ({ calendar_id }) => {
      const deleted = await calendars.delete(caller.principalId, calendar_id);
      return deleted.ok
        ? ok({ deleted: true, calendar_id: deleted.value.id, booking_passes_revoked: deleted.value.revokedPasses })
        : refused(deleted.error);
    }
  );

  server.registerTool(
    "set_calendar_display",
    {
      title: "Change how a calendar's booking page looks",
      description: `Use this when you own a calendar and want its public booking page (booking_link) to show a different view. The views are: ${DISPLAY_NAMES.join(
        ", "
      )}; how_to_model_calendars says which example each one is and when to pick it. A view that cannot show this calendar is refused with the reason. Only the calendar's owner can change it.`,
      inputSchema: { calendar_id: CalendarId, display: Display },
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
        "Use this before creating calendars for a business or anything bigger than one person's diary: a short guide to what a calendar is, when to use separate calendars or capacity, turnover, opening hours and time zones, meeting requests and booking passes, how calendars are kept apart between accounts, a team in one account, the booking page views, and every example on delt.at (appointments, restaurant tables, hotel rooms, classes, parking, seat maps, group times) with how its resources are organised and the exact create_calendar calls, each marked with what the MCP can build today.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: {},
    },
    async () => ok(calendarGuide())
  );
}
