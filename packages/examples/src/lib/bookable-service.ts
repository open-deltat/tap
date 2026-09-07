import { expandRecurrence, type AvailabilitySlot, type Booking, type DeltaT } from "@open-deltat/client";
import {
  MAX_PUBLIC_BOOKABLES,
  normalizeBookableName,
  type BookableRecord,
  type BookableRegistry,
} from "./public-bookables";
import { requireDisplayText } from "./display-text";
import { dateRangeFromToday, weekToRanges, type WeekHours } from "../examples/builder/schedule";

// Everything the public bookable feature actually does, with its two dependencies passed in. The
// server actions are a thin edge on top of this that supplies the live deltat and registry and
// applies rate limiting; the logic lives here so it can be driven against a real deltat in the
// integration suite instead of being re-implemented by a test that then drifts from it.

export interface BookableDeps {
  dt: DeltaT;
  registry: BookableRegistry;
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

export interface CreatedBookable {
  id: string;
  name: string;
  manageKey: string;
}

/** How far ahead a new bookable's open hours are written as concrete rules. */
export const HORIZON_DAYS = 60;

/** Matches the horizon, with slack for a timezone-shifted month view. */
export const MAX_QUERY_WINDOW_MS = 62 * 24 * 60 * 60 * 1000;

/** Server-assigned, per MCP-T7: long enough to survive someone leaving to check with a colleague. */
export const HOLD_TTL_MS = 5 * 60_000;

export const ALLOWED_SLOT_MINUTES: readonly number[] = [15, 30, 60, 90, 120];

/** Two blocks a day is a generous week. Uncapped, one form post becomes tens of thousands of rules. */
const MAX_WEEK_RANGES = 14;

const MAX_BOOKER_NAME_LENGTH = 60;

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface CreateBookableInput {
  name: string;
  slotMinutes: number;
  timezone: string;
  week: WeekHours;
}

interface ValidCreateInput {
  name: string;
  slotMinutes: number;
  timezone: string;
  ranges: { dow: number; startTime: string; endTime: string }[];
}

function isKnownTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** The name rules live in the registry module and throw; this surface answers in results. */
function validateName(raw: string): Outcome<string> {
  try {
    return { ok: true, value: normalizeBookableName(raw) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "That name will not work." };
  }
}

function validateCreateInput(input: CreateBookableInput): Outcome<ValidCreateInput> {
  const name = validateName(input.name);
  if (!name.ok) return name;

  if (!ALLOWED_SLOT_MINUTES.includes(input.slotMinutes)) {
    return { ok: false, error: `Pick a slot length of ${ALLOWED_SLOT_MINUTES.join(", ")} minutes.` };
  }
  if (!isKnownTimeZone(input.timezone)) {
    return { ok: false, error: "That time zone is not one this server recognises." };
  }

  const ranges = weekToRanges(input.week);
  if (ranges.length === 0) {
    return { ok: false, error: "Open at least one block of hours, or nobody can book anything." };
  }
  if (ranges.length > MAX_WEEK_RANGES) {
    return { ok: false, error: `That is more than ${MAX_WEEK_RANGES} blocks of open hours in a week.` };
  }
  if (!ranges.every((r) => TIME_OF_DAY.test(r.startTime) && TIME_OF_DAY.test(r.endTime))) {
    return { ok: false, error: "Those opening times are not readable as HH:MM." };
  }

  return {
    ok: true,
    value: { name: name.value, slotMinutes: input.slotMinutes, timezone: input.timezone, ranges },
  };
}

export async function createBookable(
  deps: BookableDeps,
  input: CreateBookableInput
): Promise<Outcome<CreatedBookable>> {
  if (deps.registry.count() >= MAX_PUBLIC_BOOKABLES) {
    return { ok: false, error: "The public registry is full. Nothing new can be created right now." };
  }

  const validated = validateCreateInput(input);
  if (!validated.ok) return validated;
  const { name, slotMinutes, timezone, ranges } = validated.value;

  const { fromDate, toDate } = dateRangeFromToday(HORIZON_DAYS);
  const segments = ranges.flatMap((range) =>
    expandRecurrence({
      daysOfWeek: [range.dow],
      startTime: range.startTime,
      endTime: range.endTime,
      fromDate,
      toDate,
      timeZone: timezone,
      blocking: false,
    })
  );
  if (segments.length === 0) {
    return { ok: false, error: `Those hours do not land on any day in the next ${HORIZON_DAYS} days.` };
  }

  const resource = await deps.dt.resources.create({ name });
  try {
    await deps.dt.rules.create(
      segments.map((s) => ({ resourceId: resource.id, start: s.start, end: s.end, blocking: false }))
    );
    const { manageKey } = deps.registry.register({ id: resource.id, name, slotMinutes, timezone });
    return { ok: true, value: { id: resource.id, name, manageKey } };
  } catch (err) {
    // Compensate. A resource the registry never learned about is unownable: nobody can rename it,
    // nobody can delete it, and it would sit in the tenant forever. Rolling it back leaves the
    // caller with an error instead of a ghost.
    await deps.dt.resources.delete(resource.id).catch(() => {});
    console.error("createBookable failed after the resource was created:", err);
    return { ok: false, error: "Something broke while setting that up. Nothing was created." };
  }
}

export async function renameBookable(
  deps: BookableDeps,
  id: string,
  manageKey: string,
  name: string
): Promise<Outcome<BookableRecord>> {
  // Authorize before validating: an unauthorized caller learns nothing about the name rules.
  if (!deps.registry.authorize(id, manageKey)) {
    return { ok: false, error: "That manage link does not open this bookable." };
  }
  const validated = validateName(name);
  if (!validated.ok) return validated;

  const renamed = deps.registry.rename(id, manageKey, validated.value);
  if (!renamed) return { ok: false, error: "That manage link does not open this bookable." };
  // deltat keeps its own copy of the name, so the two would drift and every read that goes to the
  // database rather than the registry would show the old one.
  await deps.dt.resources.update(id, { name: renamed.name });
  return { ok: true, value: renamed };
}

export async function deleteBookable(
  deps: BookableDeps,
  id: string,
  manageKey: string
): Promise<Outcome<null>> {
  if (!deps.registry.authorize(id, manageKey)) {
    return { ok: false, error: "That manage link does not open this bookable." };
  }
  // deltat first: if this throws, the registry entry survives and the owner can retry. The reverse
  // order would strand the resource with nobody holding a key to it.
  await deps.dt.resources.delete(id);
  deps.registry.unregister(id, manageKey);
  return { ok: true, value: null };
}

export async function listSlots(
  deps: BookableDeps,
  id: string,
  start: number,
  end: number
): Promise<AvailabilitySlot[]> {
  if (!deps.registry.get(id)) return [];
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  // Clamp rather than reject: a client asking for a wider window gets the window we will serve, and
  // the per-resource sweep never runs over an unbounded span.
  const clampedEnd = Math.min(end, start + MAX_QUERY_WINDOW_MS);
  return deps.dt.availability.get({ resourceId: id, start, end: clampedEnd });
}

export async function holdSlot(
  deps: BookableDeps,
  id: string,
  start: number,
  end: number
): Promise<Outcome<{ holdId: string; expiresAt: number }>> {
  if (!deps.registry.get(id)) return { ok: false, error: "That bookable no longer exists." };
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { ok: false, error: "That is not a valid span of time." };
  }

  try {
    // The expiry is ours to set, never the caller's: a client-chosen expiry is a client-chosen
    // squat. deltat rejects the hold outright if the span is already taken, which is the real
    // double-booking guard.
    const hold = await deps.dt.holds.place({
      resourceId: id,
      start,
      end,
      expiresAt: Date.now() + HOLD_TTL_MS,
    });
    return { ok: true, value: { holdId: hold.id, expiresAt: hold.expiresAt } };
  } catch {
    return { ok: false, error: "Someone else is holding that slot right now. Pick another." };
  }
}

export async function commitHold(
  deps: BookableDeps,
  id: string,
  holdId: string,
  bookedBy: string
): Promise<Outcome<{ bookingId: string }>> {
  if (!deps.registry.get(id)) return { ok: false, error: "That bookable no longer exists." };

  // GAP-02: `label` is still free text in the kernel, so this is the one place a stranger's string
  // reaches the WAL. Sanitized under the same rule as every other public display string until
  // `external_ref` lands and the name can live app-side against an opaque id.
  const label = ((): Outcome<string> => {
    try {
      return { ok: true, value: requireDisplayText(bookedBy, { field: "name", maxLength: MAX_BOOKER_NAME_LENGTH }) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "That name will not work." };
    }
  })();
  if (!label.ok) return label;

  try {
    // The hold id is a bare ULID, which SEC-03 says must never authorize a commit on its own. Here
    // it is 80 bits of randomness handed only to the browser that placed the hold, the app-tier
    // version of that guarantee rather than the signed capability MCP-T1 specifies.
    const { bookingId } = await deps.dt.holds.commit(holdId, { label: label.value });
    return { ok: true, value: { bookingId } };
  } catch {
    return { ok: false, error: "That hold expired before it was confirmed. Pick the slot again." };
  }
}

/**
 * Give a slot back before the TTL does.
 *
 * Not required for correctness: an abandoned hold expires on its own, which is the whole point of
 * modelling a negotiation as expiring state. This returns the slot in seconds instead of minutes
 * when someone changes their mind in front of us.
 */
export async function releaseHold(deps: BookableDeps, id: string, holdId: string): Promise<void> {
  if (!deps.registry.get(id)) return;
  await deps.dt.holds.release(holdId).catch(() => {});
}

/** The owner's view of who booked. Gated on the manage key: the public page must never list this. */
export async function listBookings(
  deps: BookableDeps,
  id: string,
  manageKey: string,
  window: { start: number; end: number }
): Promise<Outcome<Booking[]>> {
  if (!deps.registry.authorize(id, manageKey)) {
    return { ok: false, error: "That manage link does not open this bookable." };
  }
  return { ok: true, value: await deps.dt.bookings.get(id, window) };
}
