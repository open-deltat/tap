import type { DeltaT } from "@open-deltat/client";
import { normalizeBookableName, type BookableRecord, type BookableRegistry } from "./public-bookables";
import type { WeekHours } from "../examples/builder/schedule";
import { ALLOWED_SLOT_MINUTES, isKnownTimeZone, validateWeek, type Outcome } from "./bookable-service";
import {
  createOwnedCalendar,
  deleteOwnedCalendar,
  renameOwnedCalendar,
  saveAvailability,
  setOwnedCalendarShape,
} from "./owned-calendar-service";
import { DEFAULT_DISPLAY, checkDisplay, type Display } from "./calendar-displays";

// The signed-in caller's own calendars, for the hosted MCP: list, create, update and delete them.
// Calendars are created only here (the website shows calendars, it never creates one), so they can be
// changed and undone here too. Every write goes through the same owned-calendar path the dashboard
// edits with, so a calendar made by an agent is the same thing the owner then manages on the site.
//
// Capacity and turnover are read back from the kernel, which is the only place they are kept.

export const MAX_CALENDARS_PER_OWNER = 20;
export const MAX_CAPACITY = 500;
export const MAX_BUFFER_MINUTES = 240;
export const DEFAULT_SLOT_MINUTES = 30;

const NINE_TO_FIVE = [{ start: "09:00", end: "17:00" }];
/** Monday to Friday, 09:00 to 17:00, in the calendar's own zone. */
export const DEFAULT_WEEK: WeekHours = { 1: NINE_TO_FIVE, 2: NINE_TO_FIVE, 3: NINE_TO_FIVE, 4: NINE_TO_FIVE, 5: NINE_TO_FIVE };

/** The one answer for a calendar that is not the caller's, whether it exists or not. */
export const NOT_YOURS = "You do not own this calendar.";
const READ_FAILED = "That calendar could not be read just now. Try again.";
const BLOCK_SHAPE = "Each block needs from before to, as HH:MM, e.g. 09:00 to 17:00.";
const PLACE_BASED_ZONE = "Use a place-based zone such as Europe/Berlin.";

/** IANA's place-based areas. Legacy names (CET, EST, US/Eastern, Etc/GMT+1) are refused: their rules are not a place's. */
const ZONE_AREAS = ["Africa", "America", "Antarctica", "Arctic", "Asia", "Atlantic", "Australia", "Europe", "Indian", "Pacific"] as const;
const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
/** Far enough ahead that no booking lies beyond it. */
const FAR_AHEAD_MS = 10 * 366 * 86_400_000;

export interface MyCalendarsDeps {
  dt: DeltaT;
  registry: BookableRegistry;
  /** Absolute origin for booking links, e.g. https://delt.at; null leaves links out. */
  bookingBase: string | null;
  /** Revokes the live booking passes on a calendar being deleted (booking-pass-service revokeAllOn). */
  revokePasses: (owner: string, calendarId: string) => Promise<Outcome<number>>;
  now?: () => number;
}

export interface MyCalendar {
  readonly id: string;
  readonly name: string;
  readonly timezone: string;
  /** Opening hours per weekday (0 = Sunday), as last set. */
  readonly week: WeekHours;
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
  readonly createdAt: number;
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

/** What update can change; anything left out stays as it is. */
export interface UpdateCalendarInput {
  name?: string;
  week?: WeekHours;
  slotMinutes?: number;
  capacity?: number;
  bufferMinutes?: number;
  takesMeetingRequests?: boolean;
}

export interface MyCalendarsService {
  /** The caller's calendars, newest first; nobody else's, ever. */
  list(owner: string): Promise<Outcome<MyCalendar[]>>;
  create(owner: string, input: CreateCalendarInput): Promise<Outcome<MyCalendar>>;
  /** Change a calendar the caller owns; existing bookings stay. */
  update(owner: string, calendarId: string, input: UpdateCalendarInput): Promise<Outcome<MyCalendar>>;
  /** Delete a calendar the caller owns; refused while it has future bookings. */
  delete(owner: string, calendarId: string): Promise<Outcome<{ id: string; revokedPasses: number }>>;
  /** Change how a calendar the caller owns shows publicly; refused when the view does not fit it. */
  setDisplay(owner: string, calendarId: string, display: string): Promise<Outcome<MyCalendar>>;
}

const fail = <T>(error: string): Outcome<T> => ({ ok: false, error });
const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });

const isWhole = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
const bufferMinutesOf = (bufferAfter: number | null) => (bufferAfter ? Math.round(bufferAfter / 60_000) : 0);
const futureBookingsLabel = (n: number) => `${n} future booking${n === 1 ? "" : "s"}`;

/** UTC, or a known Area/Location name. */
function checkZone(zone: string): Outcome<string> {
  const [area] = zone.split("/");
  const placeBased = zone === "UTC" || (zone.includes("/") && ZONE_AREAS.some((a) => a === area));
  return placeBased && isKnownTimeZone(zone) ? ok(zone) : fail(PLACE_BASED_ZONE);
}

/** "09:30" as minutes after midnight; null for anything else. */
function minutesOf(hhmm: string): number | null {
  const parts = hhmm.split(":");
  if (parts.length !== 2) return null;
  const [h = "", m = ""] = parts;
  const digits = (s: string) => s.length === 2 && [...s].every((c) => c >= "0" && c <= "9");
  if (!digits(h) || !digits(m)) return null;
  const hours = Number(h);
  const minutes = Number(m);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}

/**
 * The checks a person would make reading the hours back: every block readable and forwards, no two
 * blocks on a day overlapping, and at least one block long enough for one slot. Counts and the
 * empty week are left to validateWeek, the gate the dashboard shares.
 */
function checkHours(week: WeekHours, slotMinutes: number): Outcome<null> {
  const days = DAY_LABELS.map((label, dow) => ({
    label,
    blocks: (week[dow] ?? []).map((b) => ({ text: `${b.start}-${b.end}`, from: minutesOf(b.start), to: minutesOf(b.end) })),
  }));
  const parsed = days.map((d) => ({
    label: d.label,
    blocks: d.blocks.flatMap((b) => (b.from !== null && b.to !== null && b.from < b.to ? [{ text: b.text, from: b.from, to: b.to }] : [])),
  }));
  if (parsed.some((d, i) => d.blocks.length !== days[i]?.blocks.length)) return fail(BLOCK_SHAPE);

  for (const day of parsed) {
    const sorted = [...day.blocks].sort((a, b) => a.from - b.from);
    const clash = sorted.findIndex((b, i) => i > 0 && b.from < (sorted[i - 1]?.to ?? 0));
    const first = sorted[clash - 1];
    const second = sorted[clash];
    if (clash > 0 && first && second) return fail(`Two blocks overlap on ${day.label}: ${first.text} and ${second.text}.`);
  }

  const lengths = parsed.flatMap((d) => d.blocks.map((b) => b.to - b.from));
  if (lengths.length > 0 && Math.max(...lengths) < slotMinutes) return fail(`No block is long enough for a ${slotMinutes}-minute slot.`);
  return ok(null);
}

function checkWeek(week: WeekHours, slotMinutes: number): Outcome<null> {
  const readable = checkHours(week, slotMinutes);
  if (!readable.ok) return readable;
  const gated = validateWeek(week);
  return gated.ok ? ok(null) : gated;
}

function checkName(raw: string): Outcome<string> {
  try {
    return ok(normalizeBookableName(raw));
  } catch (err) {
    return fail(err instanceof Error ? err.message : "That name will not work.");
  }
}

export function createMyCalendars(deps: MyCalendarsDeps): MyCalendarsService {
  const now = () => deps.now?.() ?? Date.now();
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
    week: record.week,
    slotMinutes: record.slotMinutes,
    takesMeetingRequests: record.bookingMode === "request",
    capacity: kernel.capacity,
    bufferMinutes: bufferMinutesOf(kernel.bufferAfter),
    display: record.display,
    bookingLink: deps.bookingBase ? `${deps.bookingBase}/b/${record.id}` : null,
    createdAt: record.createdAt,
  });

  /** Bookings that have not ended yet; null when they could not be read. */
  const futureBookings = (calendarId: string): Promise<number | null> =>
    deps.dt.bookings
      .get(calendarId, { start: now(), end: now() + FAR_AHEAD_MS })
      .then((bookings) => bookings.filter((b) => b.end > now()).length)
      .catch(() => null);

  /**
   * Take back a calendar whose create failed after it was registered, so that "nothing was created"
   * stays true. The registry entry goes whatever happens: that is what lists the calendar, counts it
   * against the cap and serves its page. If deltat cannot delete the resource, the leftover is
   * invisible without its entry and harmless, and its id is logged so an operator can remove it.
   * (Deleting an existing calendar is the opposite case, and keeps its entry when deltat fails, so
   * the owner can retry: see deleteOwnedCalendar.)
   */
  const discardHalfMade = async (id: string, owner: string) => {
    await deps.dt.resources.delete(id).catch((err: unknown) => {
      console.error(`Calendar create rolled back, but deltat resource ${id} could not be deleted and is left orphaned:`, err);
    });
    deps.registry.unregisterOwned(id, owner);
  };

  /** Everything checkable before a resource exists, so a refusal writes nothing. */
  const check = (
    input: CreateCalendarInput
  ): Outcome<{ timezone: string; slotMinutes: number; week: WeekHours; capacity: number; bufferMinutes: number; display: Display }> => {
    const timezone = checkZone(input.timezone);
    if (!timezone.ok) return timezone;
    const slotMinutes = input.slotMinutes ?? DEFAULT_SLOT_MINUTES;
    if (!ALLOWED_SLOT_MINUTES.includes(slotMinutes)) return fail(`Pick a slot length of ${ALLOWED_SLOT_MINUTES.join(", ")} minutes.`);
    const capacity = input.capacity ?? 1;
    if (!isWhole(capacity, 1, MAX_CAPACITY)) return fail(`Capacity is a whole number from 1 to ${MAX_CAPACITY}.`);
    const bufferMinutes = input.bufferMinutes ?? 0;
    if (!isWhole(bufferMinutes, 0, MAX_BUFFER_MINUTES)) return fail(`Turnover is whole minutes from 0 to ${MAX_BUFFER_MINUTES}.`);
    const week = input.week ?? DEFAULT_WEEK;
    const hours = checkWeek(week, slotMinutes);
    if (!hours.ok) return hours;
    const display = checkDisplay(input.display ?? DEFAULT_DISPLAY, { capacity, bufferMinutes, takesMeetingRequests: input.takesMeetingRequests ?? false });
    if (!display.ok) return display;
    return ok({ timezone: timezone.value, slotMinutes, week, capacity, bufferMinutes, display: display.value });
  };

  return {
    async list(owner) {
      const records = deps.registry.listOwned(owner);
      const kernel = await Promise.all(records.map((r) => deps.dt.resources.find(r.id))).catch(() => null);
      if (!kernel) return fail("Your calendars could not be read just now. Try again.");
      // A registry entry whose resource is gone cannot be booked, so it is not offered as a calendar.
      return ok(
        records.flatMap((record, i) => {
          const resource = kernel[i];
          return resource ? [view(record, resource)] : [];
        })
      );
    },

    async create(owner, input) {
      const checked = check(input);
      if (!checked.ok) return checked;
      const { timezone, slotMinutes, week, capacity, bufferMinutes, display } = checked.value;
      if (deps.registry.listOwned(owner).length + (creating.get(owner) ?? 0) >= MAX_CALENDARS_PER_OWNER) {
        return fail(`You already have ${MAX_CALENDARS_PER_OWNER} calendars, the most one account can have. Delete one with delete_calendar first.`);
      }

      adjustCreating(owner, 1);
      try {
        const made = await createOwnedCalendar(deps, {
          name: input.name,
          timezone,
          owner,
          capacity,
          bufferMinutes,
          bookingMode: input.takesMeetingRequests ? "request" : "instant",
          display,
        });
        if (!made.ok) return made;
        const { id } = made.value;
        const saved = await saveAvailability(deps, { id, owner, week, slotMinutes, priceCents: null }).catch(
          (): Outcome<BookableRecord> => ({ ok: false, error: "The opening hours could not be written, so nothing was created." })
        );
        if (!saved.ok) {
          await discardHalfMade(id, owner);
          return saved;
        }
        return ok(view(saved.value, { capacity, bufferAfter: bufferMinutes ? bufferMinutes * 60_000 : null }));
      } finally {
        adjustCreating(owner, -1);
      }
    },

    async update(owner, calendarId, input) {
      const record = deps.registry.authorizeOwner(calendarId, owner);
      if (!record) return fail(NOT_YOURS);
      const resource = await deps.dt.resources.find(calendarId).catch(() => null);
      if (!resource) return fail(READ_FAILED);

      // Every check before any write, so a refusal changes nothing.
      const currentBuffer = bufferMinutesOf(resource.bufferAfter);
      const slotMinutes = input.slotMinutes ?? record.slotMinutes;
      if (!ALLOWED_SLOT_MINUTES.includes(slotMinutes)) return fail(`Pick a slot length of ${ALLOWED_SLOT_MINUTES.join(", ")} minutes.`);
      const capacity = input.capacity ?? resource.capacity;
      if (!isWhole(capacity, 1, MAX_CAPACITY)) return fail(`Capacity is a whole number from 1 to ${MAX_CAPACITY}.`);
      const bufferMinutes = input.bufferMinutes ?? currentBuffer;
      if (!isWhole(bufferMinutes, 0, MAX_BUFFER_MINUTES)) return fail(`Turnover is whole minutes from 0 to ${MAX_BUFFER_MINUTES}.`);
      const week = input.week ?? record.week;
      const hoursChange = input.week !== undefined || input.slotMinutes !== undefined;
      if (hoursChange) {
        const hours = checkWeek(week, slotMinutes);
        if (!hours.ok) return hours;
      }
      const name = input.name === undefined ? null : checkName(input.name);
      if (name && !name.ok) return name;
      const takesRequests = input.takesMeetingRequests ?? record.bookingMode === "request";
      const fits = checkDisplay(record.display, { capacity, bufferMinutes, takesMeetingRequests: takesRequests });
      if (!fits.ok) return fits;

      // INV-01's direction: fewer places or longer turnover could leave booked times overlapping
      // past what the calendar allows, and the kernel does not check, so it is refused while anything
      // lies ahead. More places, less turnover and new hours never invalidate a booking.
      const shapeChange = capacity !== resource.capacity || bufferMinutes !== currentBuffer;
      if (capacity < resource.capacity || bufferMinutes > currentBuffer) {
        const ahead = await futureBookings(calendarId);
        if (ahead === null) return fail(READ_FAILED);
        if (ahead > 0) {
          return fail(`Fewer places or longer turnover is refused while this calendar has ${futureBookingsLabel(ahead)}: they might no longer fit. Cancel them first, or keep the current setting.`);
        }
      }

      // The writes, each through the dashboard's own path. A failure part way says what was saved.
      const saved: string[] = [];
      const stop = (part: string, reason: string | null) =>
        fail<MyCalendar>(
          `The ${part} could not be saved${reason ? ` (${reason})` : ""}.${saved.length ? ` Saved before that: ${saved.join(", ")}.` : " Nothing was changed."}`
        );
      if (shapeChange) {
        const shape = await setOwnedCalendarShape(deps, { id: calendarId, owner, capacity, bufferMinutes }).catch(() => null);
        if (!shape?.ok) return stop("places and turnover", shape && !shape.ok ? shape.error : null);
        saved.push("places and turnover");
      }
      if (hoursChange) {
        const hours = await saveAvailability(deps, {
          id: calendarId,
          owner,
          week,
          slotMinutes,
          priceCents: record.priceCents,
          currency: record.currency,
        }).catch(() => null);
        if (!hours?.ok) return stop("hours", hours && !hours.ok ? hours.error : null);
        saved.push("hours");
      }
      if (name?.ok && name.value !== record.name) {
        const renamed = await renameOwnedCalendar(deps, { id: calendarId, owner, name: name.value }).catch(() => null);
        if (!renamed?.ok) return stop("name", renamed && !renamed.ok ? renamed.error : null);
        saved.push("name");
      }
      if (takesRequests !== (record.bookingMode === "request")) {
        const mode = deps.registry.updateOwned(calendarId, owner, { bookingMode: takesRequests ? "request" : "instant" });
        if (!mode) return stop("meeting-request setting", null);
      }

      const after = deps.registry.authorizeOwner(calendarId, owner);
      if (!after) return fail(NOT_YOURS);
      return ok(view(after, { capacity, bufferAfter: bufferMinutes ? bufferMinutes * 60_000 : null }));
    },

    async delete(owner, calendarId) {
      if (!deps.registry.authorizeOwner(calendarId, owner)) return fail(NOT_YOURS);
      const ahead = await futureBookings(calendarId);
      if (ahead === null) return fail(READ_FAILED);
      if (ahead > 0) {
        return fail(`This calendar has ${futureBookingsLabel(ahead)}, so it was not deleted: nobody's booking should disappear without a word. Cancel them on the dashboard first.`);
      }
      // Passes first: once they are revoked, no booking can arrive through one while the calendar goes.
      const revoked = await deps.revokePasses(owner, calendarId);
      if (!revoked.ok) return revoked;
      // deleteOwnedCalendar removes deltat's resource before the registry entry, so a failure leaves the
      // calendar in place and listed, which is what the answer then says.
      const removed = await deleteOwnedCalendar(deps, { id: calendarId, owner }).catch(() => null);
      if (!removed?.ok) {
        const passes = revoked.value ? ` Its ${revoked.value} live booking pass${revoked.value === 1 ? " was" : "es were"} revoked.` : "";
        return fail(`The calendar could not be deleted just now, so it is still there.${passes} Try again.`);
      }
      return ok({ id: calendarId, revokedPasses: revoked.value });
    },

    async setDisplay(owner, calendarId, display) {
      const record = deps.registry.authorizeOwner(calendarId, owner);
      if (!record) return fail(NOT_YOURS);
      const resource = await deps.dt.resources.find(calendarId).catch(() => null);
      if (!resource) return fail(READ_FAILED);
      const shape = {
        capacity: resource.capacity,
        bufferMinutes: bufferMinutesOf(resource.bufferAfter),
        takesMeetingRequests: record.bookingMode === "request",
      };
      const fits = checkDisplay(display, shape);
      if (!fits.ok) return fits;
      const updated = deps.registry.updateOwned(calendarId, owner, { display: fits.value });
      if (!updated) return fail(NOT_YOURS);
      return ok(view(updated, resource));
    },
  };
}
