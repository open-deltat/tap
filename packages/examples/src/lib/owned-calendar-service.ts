import { expandRecurrence, type Booking, type DeltaT } from "@open-deltat/client";
import type { BookableRecord, BookableRegistry } from "./public-bookables";
import { MAX_PUBLIC_BOOKABLES, normalizeBookableName } from "./public-bookables";
import { dateRangeFromToday, weekToRanges, type WeekHours } from "../examples/builder/schedule";
import { HORIZON_DAYS, ALLOWED_SLOT_MINUTES, type Outcome } from "./bookable-service";

// The full round-trip for a calendar a signed-in user owns: create it, set and re-set its
// availability (hours + slot length + price), read it back, cancel bookings on it, delete it.
// Every write is authorized by the principal owning the registry record, never by a secret link.
// deltat holds the timeline and the expanded open-hours rules; the registry holds the compact week,
// the slot length, and the price (NOT-02: deltat never sees any of that).

export interface OwnedDeps {
  dt: DeltaT;
  registry: BookableRegistry;
}

export interface CalendarView {
  record: BookableRecord;
  bookings: Booking[];
}

const MAX_PRICE_CENTS = 1_000_000; // €10,000 a slot: a sanity ceiling, not a business rule

function validateName(raw: string): Outcome<string> {
  try {
    return { ok: true, value: normalizeBookableName(raw) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "That name will not work." };
  }
}

/** Create an empty calendar (a deltat resource with no open hours yet), owned by the principal. */
export async function createOwnedCalendar(
  deps: OwnedDeps,
  input: { name: string; timezone: string; owner: string }
): Promise<Outcome<{ id: string }>> {
  const name = validateName(input.name);
  if (!name.ok) return name;

  const resource = await deps.dt.resources.create({ name: name.value });
  try {
    deps.registry.register({
      id: resource.id,
      name: name.value,
      slotMinutes: 30,
      timezone: input.timezone || "UTC",
      owner: input.owner,
      priceCents: null,
      week: {},
    });
    return { ok: true, value: { id: resource.id } };
  } catch (err) {
    // A resource the registry never learned about is unownable; roll it back.
    await deps.dt.resources.delete(resource.id).catch(() => {});
    console.error("createOwnedCalendar failed after the resource was created:", err);
    return { ok: false, error: "Something broke while setting that up. Nothing was created." };
  }
}

export interface AvailabilityInput {
  week: WeekHours;
  slotMinutes: number;
  priceCents: number | null;
  currency?: string;
}

/** Replace the calendar's open hours (expanded into rules) and update its slot length and price. */
export async function saveAvailability(
  deps: OwnedDeps,
  input: { id: string; owner: string } & AvailabilityInput
): Promise<Outcome<BookableRecord>> {
  const record = deps.registry.authorizeOwner(input.id, input.owner);
  if (!record) return { ok: false, error: "You do not own this calendar." };

  if (!ALLOWED_SLOT_MINUTES.includes(input.slotMinutes)) {
    return { ok: false, error: "Pick a slot length of 15, 30, 60, 90, or 120 minutes." };
  }
  if (input.priceCents !== null && (!Number.isInteger(input.priceCents) || input.priceCents < 0 || input.priceCents > MAX_PRICE_CENTS)) {
    return { ok: false, error: "That price is out of range." };
  }

  const ranges = weekToRanges(input.week);
  const { fromDate, toDate } = dateRangeFromToday(HORIZON_DAYS);
  const segments = ranges.flatMap((range) =>
    expandRecurrence({
      daysOfWeek: [range.dow],
      startTime: range.startTime,
      endTime: range.endTime,
      fromDate,
      toDate,
      timeZone: record.timezone,
      blocking: false,
    })
  );

  // Empty hours is legal: it means "no availability yet", and replaceOpenHours clears the rules.
  await deps.dt.rules.replaceOpenHours(
    input.id,
    segments.map((s) => ({ start: s.start, end: s.end }))
  );

  const updated = deps.registry.updateOwned(input.id, input.owner, {
    slotMinutes: input.slotMinutes,
    priceCents: input.priceCents,
    currency: input.currency,
    week: input.week,
  });
  if (!updated) return { ok: false, error: "You do not own this calendar." };
  return { ok: true, value: updated };
}

/** The calendar plus its current bookings, for the management page. */
export async function getOwnedCalendar(
  deps: OwnedDeps,
  input: { id: string; owner: string }
): Promise<Outcome<CalendarView>> {
  const record = deps.registry.authorizeOwner(input.id, input.owner);
  if (!record) return { ok: false, error: "You do not own this calendar." };
  const bookings = await deps.dt.bookings.get(input.id);
  return { ok: true, value: { record, bookings } };
}

export async function renameOwnedCalendar(
  deps: OwnedDeps,
  input: { id: string; owner: string; name: string }
): Promise<Outcome<BookableRecord>> {
  if (!deps.registry.authorizeOwner(input.id, input.owner)) {
    return { ok: false, error: "You do not own this calendar." };
  }
  const name = validateName(input.name);
  if (!name.ok) return name;
  const updated = deps.registry.updateOwned(input.id, input.owner, { name: name.value });
  if (!updated) return { ok: false, error: "You do not own this calendar." };
  await deps.dt.resources.update(input.id, { name: updated.name });
  return { ok: true, value: updated };
}

/** Cancel one booking on a calendar the caller owns. */
export async function cancelOwnedBooking(
  deps: OwnedDeps,
  input: { id: string; owner: string; bookingId: string }
): Promise<Outcome<null>> {
  if (!deps.registry.authorizeOwner(input.id, input.owner)) {
    return { ok: false, error: "You do not own this calendar." };
  }
  // Owning the calendar is not enough: deltat cancels a booking by bare id with no resource scope,
  // so we must confirm this booking is actually on this calendar, or an owner could cancel a
  // booking on someone else's calendar by guessing its id (ownership verification on entity access).
  const bookings = await deps.dt.bookings.get(input.id);
  if (!bookings.some((b) => b.id === input.bookingId)) {
    return { ok: false, error: "That booking is not on this calendar." };
  }
  await deps.dt.bookings.cancel(input.bookingId);
  return { ok: true, value: null };
}

/** Delete the calendar: the deltat resource (and everything on it) and the registry record. */
export async function deleteOwnedCalendar(
  deps: OwnedDeps,
  input: { id: string; owner: string }
): Promise<Outcome<null>> {
  if (!deps.registry.authorizeOwner(input.id, input.owner)) {
    return { ok: false, error: "You do not own this calendar." };
  }
  await deps.dt.resources.delete(input.id);
  deps.registry.unregisterOwned(input.id, input.owner);
  return { ok: true, value: null };
}

export { MAX_PUBLIC_BOOKABLES };
