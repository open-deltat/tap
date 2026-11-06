import { HORIZON_DAYS, ALLOWED_SLOT_MINUTES } from "./bookable-service";
import { MAX_BUFFER_MINUTES, MAX_CAPACITY, MAX_CALENDARS_PER_OWNER } from "./my-calendars";
import { DISPLAY_NAMES, DISPLAYS, NOT_YET } from "./calendar-displays";
import type { ExampleId } from "../examples/config";
import type { DaySchedule } from "../actions/schedule-window";
import type { WeekHours } from "../examples/builder/schedule";
import * as airline from "../examples/airline/structure";
import * as availability from "../examples/availability/structure";
import * as builder from "../examples/builder/structure";
import * as cinema from "../examples/cinema/structure";
import * as gym from "../examples/gym/structure";
import * as hotel from "../examples/hotel/structure";
import * as live from "../examples/live/structure";
import * as meet from "../examples/meet/structure";
import * as parking from "../examples/parking/structure";
import * as restaurant from "../examples/restaurant/structure";
import * as stadium from "../examples/stadium/structure";
import * as theater from "../examples/theater/structure";
import { CHECK_IN_HOUR, CHECK_OUT_HOUR } from "../examples/hotel/policy";

// What how_to_model_calendars returns: how to organise a business as calendars, told through the
// examples on delt.at. Every example's shape is read from the same structure module its seed builds
// it from, so the guide cannot drift from the examples; and every create_calendar call an entry
// offers is one the endpoint test runs, so it cannot promise a call that fails.

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
type Day = (typeof DAY_NAMES)[number];
type WeeklyHours = Partial<Record<Day, { from: string; to: string }[]>>;

/** An example zone for the calls; the guide tells the agent to use the business's own. */
const ZONE = "Europe/Berlin";

export interface GuideStep {
  readonly tool: string;
  readonly arguments: Record<string, unknown>;
}

export interface ExampleGuide {
  /** The example's id on delt.at (/demos/<id>). */
  readonly example: ExampleId;
  readonly title: string;
  readonly what: string;
  /** How its resources are organised, top down. */
  readonly organised: readonly string[];
  readonly settings: string;
  /** Whether create_calendar can build this today: fully, as a flatter version, or not at all. */
  readonly mcp_can_build: "yes" | "partly" | "no";
  /** The calls that build what can be built, in order. Empty when nothing can be. */
  readonly steps: readonly GuideStep[];
  /** What the MCP cannot do yet for this example. */
  readonly cannot_yet: string | null;
}

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * A seed schedule as create_calendar's weekly_hours. A block that runs past midnight cannot be
 * written that way, so it is cut at 23:59 and `fits` says so.
 */
function weeklyHours(schedule: DaySchedule): { hours: WeeklyHours; fits: boolean } {
  const entries = DAY_NAMES.flatMap((day, dow) => {
    const shows = schedule[dow];
    return shows?.length
      ? [[day, shows.map((s) => ({ start: s.h * 60 + s.m, end: s.h * 60 + s.m + s.dur }))] as const]
      : [];
  });
  const fits = entries.every(([, blocks]) => blocks.every((b) => b.end < 24 * 60));
  const hours = Object.fromEntries(
    entries.map(([day, blocks]) => [day, blocks.map((b) => ({ from: hhmm(b.start), to: hhmm(Math.min(b.end, 24 * 60 - 1)) }))])
  );
  return { hours, fits };
}

/** The builder's week shape (dow -> [{start, end}]) as weekly_hours. */
const fromWeek = (week: WeekHours): WeeklyHours =>
  Object.fromEntries(DAY_NAMES.flatMap((day, dow) => (week[dow]?.length ? [[day, week[dow].map((r) => ({ from: r.start, to: r.end }))]] : [])));

/** Every block's length, when they all agree; null when they differ. */
const lengthOf = (schedule: DaySchedule): number | null => {
  const lengths = new Set(Object.values(schedule).flatMap((shows) => shows.map((s) => s.dur)));
  const [only] = [...lengths];
  return lengths.size === 1 && only !== undefined ? only : null;
};

const slotFits = (minutes: number) => ALLOWED_SLOT_MINUTES.includes(minutes);

const create = (args: Record<string, unknown>): GuideStep => ({ tool: "create_calendar", arguments: { timezone: ZONE, ...args } });

const seats = (rows: readonly unknown[], numbers: readonly unknown[]) => rows.length * numbers.length;

function restaurantGuide(): ExampleGuide {
  const tables = restaurant.SECTIONS.flatMap((s) => s.tables);
  const bySize = [...new Set(tables.map((t) => t.maxGuests))].sort((a, b) => a - b).map((size) => ({
    size,
    count: tables.filter((t) => t.maxGuests === size).length,
  }));
  const { hours } = weeklyHours(restaurant.SERVICE_HOURS);
  const common = { slot_minutes: restaurant.SEATING_MINUTES, buffer_minutes: restaurant.TURNOVER_MINUTES, weekly_hours: hours };
  return {
    example: "restaurant",
    title: "Restaurant tables",
    what: `${restaurant.NAME}: tables of different sizes in three rooms, plus a walk-up bar.`,
    organised: [
      `The restaurant is the top calendar; each room is a calendar under it (${restaurant.SECTIONS.map((s) => s.name).join(", ")}).`,
      ...restaurant.SECTIONS.map((s) => `${s.name}: one calendar per table, ${s.tables.map((t) => `${t.name} for ${t.maxGuests}`).join(", ")}.`),
      `The bar is one calendar with ${restaurant.BAR.capacity} places, not ${restaurant.BAR.capacity} tables: a party takes as many places as it has guests.`,
    ],
    settings: `${restaurant.SEATING_MINUTES}-minute seatings, ${restaurant.TURNOVER_MINUTES} minutes to reset a table, open every day 11:00 to 22:00.`,
    mcp_can_build: "partly",
    steps: [
      ...bySize.map(({ size, count }) => create({ name: `Tables for ${size}`, capacity: count, ...common })),
      create({ name: restaurant.BAR.name, capacity: restaurant.BAR.capacity, ...common }),
    ],
    cannot_yet:
      "The MCP cannot build rooms above the tables yet (sub-calendars), so the steps group identical tables into one calendar per size, with capacity as the number of such tables. Picking one specific table, and closing one table for an evening, are not possible through the MCP yet.",
  };
}

function gymGuide(): ExampleGuide {
  const buildable = gym.COURSES.filter((c) => {
    const len = lengthOf(c.schedule);
    return len !== null && slotFits(len);
  });
  const left = gym.COURSES.filter((c) => !buildable.includes(c));
  return {
    example: "gym",
    title: "Classes with places",
    what: `${gym.NAME}: weekly classes, each with a fixed number of places.`,
    organised: [
      "The studio is the top calendar; each class is a calendar under it.",
      ...gym.COURSES.map((c) => `${c.name}: one calendar with ${c.capacity} places, open only at its class times.`),
    ],
    settings: "A class calendar is open only during its classes, and its capacity is the number of places, so the hour stays bookable until it is full.",
    mcp_can_build: left.length === 0 ? "yes" : "partly",
    steps: buildable.map((c) => {
      const len = lengthOf(c.schedule) ?? 60;
      return create({ name: c.name, capacity: c.capacity, slot_minutes: len, weekly_hours: weeklyHours(c.schedule).hours });
    }),
    cannot_yet: `The studio above the classes (sub-calendars) cannot be built through the MCP yet, so each class is its own calendar. ${left
      .map((c) => `${c.name} (${lengthOf(c.schedule) ?? "mixed"} minutes)`)
      .join(", ")} cannot be created: the slot length is ${ALLOWED_SLOT_MINUTES.join(", ")} minutes.`,
  };
}

function parkingGuide(): ExampleGuide {
  const zones = parking.FLOORS.flatMap((f) => f.zones.map((z) => ({ ...z, floor: f.name })));
  const { hours, fits } = weeklyHours(parking.ALWAYS_OPEN);
  return {
    example: "parking",
    title: "Parking zones",
    what: `${parking.NAME}: zones on ${parking.FLOORS.length} floors, each with a number of spots.`,
    organised: [
      "The garage is the top calendar; each floor is a calendar under it, with no places of its own.",
      ...parking.FLOORS.map((f) => `${f.name}: ${f.zones.map((z) => `${z.name} with ${z.capacity} spots`).join(", ")}; each zone is one calendar.`),
    ],
    settings: `One-hour bookings, open around the clock. A car takes one spot in a zone; the zone is full when all its spots are taken.`,
    mcp_can_build: "partly",
    steps: zones.map((z) => create({ name: `${z.name} (${z.floor})`, capacity: z.capacity, slot_minutes: parking.SLOT_MINUTES, weekly_hours: hours })),
    cannot_yet: `Floors above the zones (sub-calendars) cannot be built through the MCP yet, so each zone is its own calendar.${fits ? "" : " Opening hours stop at 23:59, so parking across midnight cannot be booked."}`,
  };
}

function meetGuide(): ExampleGuide {
  return {
    example: "meet",
    title: "When is a group free",
    what: `${meet.FRIENDS.length} friends looking for an evening they are all free.`,
    organised: [
      `One calendar per person (${meet.FRIENDS.map((f) => f.name).join(", ")}); no calendar above them.`,
      "Each is open in the evenings and closed on the evening that person is always busy.",
    ],
    settings: `${meet.SLOT_MINUTES}-minute slots; each person has their own evening hours.`,
    mcp_can_build: "partly",
    steps: meet.FRIENDS.map((f) =>
      create({
        name: f.name,
        slot_minutes: meet.SLOT_MINUTES,
        weekly_hours: Object.fromEntries(
          DAY_NAMES.flatMap((day, dow) => (f.busyDows.includes(dow) ? [] : [[day, [{ from: hhmm(f.open[0] * 60), to: hhmm(f.open[1] * 60) }]]]))
        ),
      })
    ),
    cannot_yet:
      "The calendars can be created, but finding the time all of them share is not a tool on the MCP yet (find_meeting_times looks at one calendar). Part-evening commitments and one-off evenings away cannot be set either.",
  };
}

function hotelGuide(): ExampleGuide {
  return {
    example: "hotel",
    title: "Hotel rooms",
    what: `${hotel.NAME}: rooms booked for one or more nights.`,
    organised: [
      "The hotel is the top calendar; each room type is a calendar under it.",
      ...hotel.ROOM_TYPES.map((t) => `${t.name}: one calendar with capacity ${t.capacity}, the number of rooms of that type.`),
    ],
    settings: `A stay runs from check-in at ${CHECK_IN_HOUR}:00 to check-out at ${CHECK_OUT_HOUR}:00 on the last day.`,
    mcp_can_build: "no",
    steps: [],
    cannot_yet: `The MCP cannot build this shape yet: a stay lasts nights, and the longest booking create_calendar offers is ${Math.max(...ALLOWED_SLOT_MINUTES)} minutes. Room types under a hotel (sub-calendars) are not available either.`,
  };
}

/** A venue sold seat by seat: one calendar per seat, grouped under sections. */
function seatMapGuide(example: ExampleId, title: string, what: string, organised: string[], settings: string, minutes: number): ExampleGuide {
  return {
    example,
    title,
    what,
    organised,
    settings,
    mcp_can_build: "no",
    steps: [],
    cannot_yet: `The MCP cannot build this shape yet: a seat map is a calendar per seat under sections (sub-calendars), and a ${minutes}-minute ${
      slotFits(minutes) ? "booking fits" : "booking does not fit the slot lengths"
    }. Use a single calendar with capacity if people do not need to choose their seat.`,
  };
}

const GUIDES: Record<ExampleId, () => ExampleGuide> = {
  availability: () => ({
    example: "availability",
    title: "Appointments",
    what: `${availability.NAME}: one person's appointments, open hours minus what is booked.`,
    organised: ["One calendar for one person; no calendar above or below it."],
    settings: `${availability.SLOT_MINUTES}-minute appointments, Monday to Friday 09:00 to 17:00, with ${availability.DAYS_OFF.length} whole days off.`,
    mcp_can_build: "yes",
    steps: [create({ name: availability.NAME, slot_minutes: availability.SLOT_MINUTES, weekly_hours: weeklyHours(availability.OFFICE_HOURS).hours })],
    cannot_yet: "A single day off cannot be set through the MCP yet.",
  }),
  builder: () => ({
    example: "builder",
    title: "Weekly hours",
    what: "One calendar whose weekly opening hours its owner sets once.",
    organised: ["One calendar; its hours repeat every week."],
    settings: `${builder.SLOT_MINUTES}-minute slots, weekday hours to start with.`,
    mcp_can_build: "yes",
    steps: [create({ name: "Weekly hours", slot_minutes: builder.SLOT_MINUTES, weekly_hours: fromWeek(builder.DEFAULT_WEEK) })],
    cannot_yet: "Changing the hours later is done on the dashboard; the MCP cannot change hours yet.",
  }),
  meet: meetGuide,
  gym: gymGuide,
  restaurant: restaurantGuide,
  parking: parkingGuide,
  hotel: hotelGuide,
  stadium: () => ({
    example: "stadium",
    title: "Stadium tickets",
    what: `${stadium.NAME}: about ${stadium.TIERS.reduce((n, t) => n + t.sections * t.capacity, 0).toLocaleString("en-US")} places in tiers of sections.`,
    organised: [
      "The stadium is the top calendar; each tier is a calendar under it, and each section a calendar under its tier.",
      ...stadium.TIERS.map((t) =>
        t.assigned ? `${t.name}: ${t.sections} boxes, each reserved outright (capacity 1).` : `${t.name}: ${t.sections} sections of ${t.capacity} places each (capacity ${t.capacity}).`
      ),
    ],
    settings: `Events of ${stadium.EVENT_DUR} minutes, twice a day.`,
    mcp_can_build: "no",
    steps: [],
    cannot_yet: `The MCP cannot build this shape yet: it needs sections under tiers (sub-calendars), more than ${MAX_CALENDARS_PER_OWNER} calendars, capacities above ${MAX_CAPACITY}, and ${stadium.EVENT_DUR}-minute bookings.`,
  }),
  airline: () =>
    seatMapGuide(
      "airline",
      "Flight seats",
      `${airline.FLIGHTS.length} flights, each sold seat by seat.`,
      [
        "Each flight is a top calendar; each cabin is a calendar under it; each seat is a calendar under its cabin, with capacity 1.",
        ...airline.FLIGHTS[0].cabins.map((c) => `${c.name}: rows ${c.rows[0]} to ${c.rows[c.rows.length - 1]}, seats ${c.seats.join(" ")} (${seats(c.rows, c.seats)} seats).`),
      ],
      `Every seat is booked for the whole flight, with ${airline.TURNAROUND_MINUTES} minutes of turnaround.`,
      airline.FLIGHTS[0].durationMinutes
    ),
  theater: () =>
    seatMapGuide(
      "theater",
      "Theater seats",
      `${theater.NAME}: seats in three sections, sold per performance.`,
      [
        "The show is the top calendar; each section is a calendar under it; each seat is a calendar under its section, with capacity 1.",
        ...theater.SECTIONS.map((s) => `${s.name}: rows ${s.rows.join(", ")}, seats 1 to ${s.seats.length} (${seats(s.rows, s.seats)} seats).`),
      ],
      `${theater.SHOW_MINUTES}-minute performances on a weekly grid, ${theater.BUFFER_MINUTES} minutes between them.`,
      theater.SHOW_MINUTES
    ),
  cinema: () =>
    seatMapGuide(
      "cinema",
      "Movie seats",
      `${cinema.NAME}: ${cinema.SCREENS.length} screens, each with its own film and showtimes.`,
      [
        "The cinema is the top calendar; each screen is a calendar under it, with its own showtimes; each seat is a calendar under its screen.",
        `Every screen: rows ${cinema.SEAT_ROWS.join(", ")}, seats 1 to ${cinema.SEAT_NUMBERS.length} (${seats(cinema.SEAT_ROWS, cinema.SEAT_NUMBERS)} seats).`,
      ],
      `${cinema.RUNTIME}-minute showings, ${cinema.BUFFER_MINUTES} minutes to clean between them.`,
      cinema.RUNTIME
    ),
  live: () =>
    seatMapGuide(
      "live",
      "Seats that update live",
      `One screen of ${live.REUSED_VENUE}, shown twice: a held seat appears on the other view at once.`,
      [`The same shape as the cinema: a screen with rows ${live.SEAT_ROWS.join(", ")} and seats 1 to ${live.SEAT_NUMBERS.length}, one calendar per seat.`],
      "Holds and bookings show up for everyone looking, the moment they happen.",
      live.RUNTIME
    ),
};

export function calendarGuide() {
  return {
    what_a_calendar_is:
      "A calendar is one thing that can be booked: a person, a room, a table, a machine, or a group of identical ones. Each calendar has its own opening hours, time zone, slot length and booking link, and one booking takes one place on it.",
    choosing: [
      "Make separate calendars when people choose which one they want (a named practitioner, a specific room), or when the things are not interchangeable.",
      `Use one calendar with capacity when the places are identical and people only need one of them: a class of 12 is capacity 12, five identical e-bikes are capacity 5 (up to ${MAX_CAPACITY}).`,
      "The examples on delt.at also use calendars under calendars (a restaurant above its rooms above its tables). The MCP cannot build that yet; each example below says what it builds instead.",
    ],
    turnover: `buffer_minutes keeps time free after each booking, for cleaning, resetting a table or charging (0 to ${MAX_BUFFER_MINUTES} minutes).`,
    hours_and_time_zones: `weekly_hours are in the calendar's own time zone, an IANA name; use the business's own (the steps below use ${ZONE}). They are written for the next ${HORIZON_DAYS} days. Without weekly_hours a calendar is open Monday to Friday, 09:00 to 17:00. The slot length is ${ALLOWED_SLOT_MINUTES.join(", ")} minutes; the booking link offers slots of that length inside the opening hours.`,
    who_can_book: [
      "takes_meeting_requests false (the default): anyone can book a free slot directly on the booking link; they must be signed in unless the owner turns that off on the dashboard.",
      "takes_meeting_requests true: people ask (request_meeting, or on the booking link) and nothing is booked until the owner approves with approve_meeting_request.",
      "A booking pass (create_booking_pass) lets one specific agent book directly inside a window, even on a calendar that takes requests.",
    ],
    separation:
      "Every calendar belongs to the signed-in account that created it. Nobody else sees it in list_my_calendars, and nobody else can change it, read its meeting requests or mint passes for it. Other people reach it only through what the owner hands out: the booking link or calendar id (which show free times and let people book or ask, as takes_meeting_requests says) and booking passes. The booking link shows free times only, never other people's bookings.",
    company: {
      pattern:
        "A team in one account: one calendar per person (Anna, Ben, Chris) and one per shared room (Meeting room, Studio). They are separate calendars side by side; the MCP cannot put them under one company calendar yet.",
      reaching_each:
        "Each calendar has its own booking link, its own meeting requests and its own booking passes. Hand a client Anna's link to ask Anna, or mint a pass on the Meeting room to let one agent book the room. A person and a room cannot be booked together in one step yet.",
      requests_or_direct:
        "Give a person's calendar takes_meeting_requests true when that person wants to approve each meeting. Leave it false when anyone with the booking link, or with a booking pass, may book a free time directly, as for a shared room.",
      who_manages:
        "All of them belong to the account that created them; teammates do not manage their own calendar from their own account yet.",
    },
    displays: {
      about: "How a calendar's public booking page looks. Set it with create_calendar's display, or change it with set_calendar_display.",
      available: DISPLAY_NAMES.map((d) => ({ display: d, example: DISPLAYS[d].example, when_to_pick: DISPLAYS[d].pick })),
      not_yet: NOT_YET,
    },
    changing_and_undoing:
      "update_calendar changes a calendar's name, hours, slot length, places, turnover or whether it takes requests; bookings already made stay. delete_calendar removes a calendar made by mistake; it is refused while the calendar has future bookings.",
    limits: `One account can own up to ${MAX_CALENDARS_PER_OWNER} calendars; delete_calendar frees a place.`,
    examples: (Object.keys(GUIDES) as ExampleId[]).map((id) => GUIDES[id]()),
  };
}
