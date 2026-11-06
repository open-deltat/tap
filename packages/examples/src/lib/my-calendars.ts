import type { DeltaT } from "@open-deltat/client";
import type { BookableRecord, BookableRegistry } from "./public-bookables";
import type { WeekHours } from "../examples/builder/schedule";
import { ALLOWED_SLOT_MINUTES, isKnownTimeZone, validateWeek, type Outcome } from "./bookable-service";
import { createOwnedCalendar, deleteOwnedCalendar, saveAvailability } from "./owned-calendar-service";
import { DEFAULT_DISPLAY, checkDisplay, type Display } from "./calendar-displays";

// The signed-in caller's own calendars, for the hosted MCP: list them and create them. Creating a
// calendar happens only here (the website shows calendars, it never creates one), through the same
// owned-calendar path the dashboard edits with, so a calendar made by an agent is the same thing the
// owner then manages on the site.
//
// Capacity and turnover are read back from the kernel, which is the only place they are kept.

export const MAX_CALENDARS_PER_OWNER = 20;
export const MAX_CAPACITY = 500;
export const MAX_BUFFER_MINUTES = 240;
export const DEFAULT_SLOT_MINUTES = 30;

const NINE_TO_FIVE = [{ start: "09:00", end: "17:00" }];
/** Monday to Friday, 09:00 to 17:00, in the calendar's own zone. */
export const DEFAULT_WEEK: WeekHours = { 1: NINE_TO_FIVE, 2: NINE_TO_FIVE, 3: NINE_TO_FIVE, 4: NINE_TO_FIVE, 5: NINE_TO_FIVE };

export interface MyCalendarsDeps {
  dt: DeltaT;
  registry: BookableRegistry;
  /** Absolute origin for booking links, e.g. https://delt.at; null leaves links out. */
  bookingBase: string | null;
}

export interface MyCalendar {
  readonly id: string;
  readonly name: string;
  readonly timezone: string;
  readonly slotMinutes: number;
  readonly takesMeetingRequests: boolean;
  /** How many bookings may overlap: 1 for a person or a room, 12 for a class of twelve. */
  readonly capacity: number;
  /** Turnover kept free after each booking. */
  readonly bufferMinutes: number;
  /** How its public booking page looks. */
  readonly display: Display;
  /** The public page where people book (or ask for) a time. */
  readonly bookingLink: string | null;
}

export interface CreateCalendarInput {
  name: string;
  timezone: string;
  slotMinutes?: number;
  week?: WeekHours;
  takesMeetingRequests?: boolean;
  capacity?: number;
  bufferMinutes?: number;
  /** A view from calendar-displays.ts; checked, since it arrives from outside. */
  display?: string;
}

export interface MyCalendarsService {
  /** The caller's calendars, newest first; nobody else's, ever. */
  list(owner: string): Promise<Outcome<MyCalendar[]>>;
  create(owner: string, input: CreateCalendarInput): Promise<Outcome<MyCalendar>>;
  /** Change how a calendar the caller owns shows publicly; refused when the view does not fit it. */
  setDisplay(owner: string, calendarId: string, display: string): Promise<Outcome<MyCalendar>>;
}

const fail = <T>(error: string): Outcome<T> => ({ ok: false, error });
const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });

const isWhole = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;

export function createMyCalendars(deps: MyCalendarsDeps): MyCalendarsService {
  // Creates in flight per owner, counted with the calendars they already own, so a burst of calls
  // cannot all pass the cap before the first one is registered. One process, as the registry is.
  const creating = new Map<string, number>();
  const adjustCreating = (owner: string, by: number) => {
    const next = (creating.get(owner) ?? 0) + by;
    if (next > 0) creating.set(owner, next);
    else creating.delete(owner);
  };

  const view = (record: BookableRecord, kernel: { capacity: number; bufferAfter: number | null }): MyCalendar => ({
    id: record.id,
    name: record.name,
    timezone: record.timezone,
    slotMinutes: record.slotMinutes,
    takesMeetingRequests: record.bookingMode === "request",
    capacity: kernel.capacity,
    bufferMinutes: kernel.bufferAfter ? Math.round(kernel.bufferAfter / 60_000) : 0,
    display: record.display,
    bookingLink: deps.bookingBase ? `${deps.bookingBase}/b/${record.id}` : null,
  });

  /** Everything checkable before a resource exists, so a refusal writes nothing. */
  const check = (
    input: CreateCalendarInput
  ): Outcome<{ slotMinutes: number; week: WeekHours; capacity: number; bufferMinutes: number; display: Display }> => {
    if (!input.timezone || !isKnownTimeZone(input.timezone)) {
      return fail("That time zone is not one this server knows. Use an IANA name such as Europe/Berlin or America/New_York.");
    }
    const slotMinutes = input.slotMinutes ?? DEFAULT_SLOT_MINUTES;
    if (!ALLOWED_SLOT_MINUTES.includes(slotMinutes)) return fail(`Pick a slot length of ${ALLOWED_SLOT_MINUTES.join(", ")} minutes.`);
    const capacity = input.capacity ?? 1;
    if (!isWhole(capacity, 1, MAX_CAPACITY)) return fail(`Capacity is a whole number from 1 to ${MAX_CAPACITY}.`);
    const bufferMinutes = input.bufferMinutes ?? 0;
    if (!isWhole(bufferMinutes, 0, MAX_BUFFER_MINUTES)) return fail(`Turnover is whole minutes from 0 to ${MAX_BUFFER_MINUTES}.`);
    const week = input.week ?? DEFAULT_WEEK;
    const hours = validateWeek(week);
    if (!hours.ok) return hours;
    const display = checkDisplay(input.display ?? DEFAULT_DISPLAY, { capacity, bufferMinutes, takesMeetingRequests: input.takesMeetingRequests ?? false });
    if (!display.ok) return display;
    return ok({ slotMinutes, week, capacity, bufferMinutes, display: display.value });
  };

  return {
    async list(owner) {
      const records = deps.registry.listOwned(owner);
      const kernel = await Promise.all(records.map((r) => deps.dt.resources.find(r.id))).catch(() => null);
      if (!kernel) return fail("Your calendars could not be read just now. Try again.");
      // A registry entry whose resource is gone cannot be booked, so it is not offered as a calendar.
      return ok(records.flatMap((record, i) => {
        const resource = kernel[i];
        return resource ? [view(record, resource)] : [];
      }));
    },

    async create(owner, input) {
      const checked = check(input);
      if (!checked.ok) return checked;
      const { slotMinutes, week, capacity, bufferMinutes, display } = checked.value;
      if (deps.registry.listOwned(owner).length + (creating.get(owner) ?? 0) >= MAX_CALENDARS_PER_OWNER) {
        return fail(`You already have ${MAX_CALENDARS_PER_OWNER} calendars, the most one account can have. Delete one on the dashboard first.`);
      }

      adjustCreating(owner, 1);
      try {
        const made = await createOwnedCalendar(deps, { name: input.name, timezone: input.timezone, owner, capacity, bufferMinutes });
        if (!made.ok) return made;
        const { id } = made.value;
        const saved = await saveAvailability(deps, { id, owner, week, slotMinutes, priceCents: null }).catch(
          (): Outcome<BookableRecord> => ({ ok: false, error: "The opening hours could not be written, so nothing was created." })
        );
        if (!saved.ok) {
          // A calendar without its hours would read as permanently full; take it back out.
          await deleteOwnedCalendar(deps, { id, owner }).catch(() => {});
          return saved;
        }
        const record =
          deps.registry.updateOwned(id, owner, { display, ...(input.takesMeetingRequests && { bookingMode: "request" as const }) }) ?? saved.value;
        return ok(view(record, { capacity, bufferAfter: bufferMinutes ? bufferMinutes * 60_000 : null }));
      } finally {
        adjustCreating(owner, -1);
      }
    },

    async setDisplay(owner, calendarId, display) {
      const record = deps.registry.authorizeOwner(calendarId, owner);
      if (!record) return fail("No such calendar of yours.");
      const resource = await deps.dt.resources.find(calendarId).catch(() => null);
      if (!resource) return fail("That calendar could not be read just now. Try again.");
      const shape = {
        capacity: resource.capacity,
        bufferMinutes: resource.bufferAfter ? Math.round(resource.bufferAfter / 60_000) : 0,
        takesMeetingRequests: record.bookingMode === "request",
      };
      const fits = checkDisplay(display, shape);
      if (!fits.ok) return fits;
      const updated = deps.registry.updateOwned(calendarId, owner, { display: fits.value });
      if (!updated) return fail("No such calendar of yours.");
      return ok(view(updated, resource));
    },
  };
}
