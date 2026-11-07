import type { AvailabilitySlot, DeltaT } from "@open-deltat/client";
import { normalizeBookableName, type BookableRecord, type BookableRegistry } from "./public-bookables";
import { requireDisplayText } from "./display-text";
import { weekToRanges, type WeekHours } from "../examples/builder/schedule";
import { opaqueRef, withWho, type BookingDetailsStore, type BookingWithWho } from "./booking-details";

// Everything the public bookable feature does once a bookable exists, with its two dependencies
// passed in: list slots, hold, book, release, and the manage-link writes (rename, delete, bookings).
// The server actions are a thin edge on top that supplies the live deltat and registry and applies
// rate limiting. Creating a bookable is not here: calendars are created only through the hosted MCP
// (my-calendars.ts).

export interface BookableDeps {
  dt: DeltaT;
  registry: BookableRegistry;
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

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

export function isKnownTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The single guarded gate from a weekly-hours shape to open-hour ranges, shared by the create path
 * and the owned-availability edit path so neither can drift from the other's bounds: at least one
 * block, at most MAX_WEEK_RANGES (one form post must not become tens of thousands of rules), and
 * every time readable as HH:MM. Timezone is validated by the caller.
 */
export function validateWeek(
  week: WeekHours
): Outcome<{ dow: number; startTime: string; endTime: string }[]> {
  const ranges = weekToRanges(week);
  if (ranges.length === 0) {
    return { ok: false, error: "Open at least one block of hours, or nobody can book anything." };
  }
  if (ranges.length > MAX_WEEK_RANGES) {
    return { ok: false, error: `That is more than ${MAX_WEEK_RANGES} blocks of open hours in a week.` };
  }
  if (!ranges.every((r) => TIME_OF_DAY.test(r.startTime) && TIME_OF_DAY.test(r.endTime))) {
    return { ok: false, error: "Those opening times are not readable as HH:MM." };
  }
  return { ok: true, value: ranges };
}

/** The name rules live in the registry module and throw; this surface answers in results. */
function validateName(raw: string): Outcome<string> {
  try {
    return { ok: true, value: normalizeBookableName(raw) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "That name will not work." };
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

/**
 * A calendar whose owner approves each meeting takes requests, never direct holds or bookings.
 * Checked here, where every hold and commit path passes, rather than only in the UI.
 */
export const REQUESTS_ONLY = "This calendar takes meeting requests: ask for a time and the owner confirms it.";

/**
 * Whether placing a hold here needs an account the caller does not have. Reading the schedule is
 * always public; booking can require sign-in. Every hold path asks this, including the /ws bridge,
 * which cannot see the site session and so always asks as signed out.
 */
export function holdNeedsSignIn(record: Pick<BookableRecord, "requireLoginToBook"> | undefined, signedIn: boolean): boolean {
  return record?.requireLoginToBook === true && !signedIn;
}

export async function holdSlot(
  deps: BookableDeps,
  id: string,
  start: number,
  end: number
): Promise<Outcome<{ holdId: string; expiresAt: number }>> {
  const record = deps.registry.get(id);
  if (!record) return { ok: false, error: "That bookable no longer exists." };
  if (record.bookingMode === "request") return { ok: false, error: REQUESTS_ONLY };
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

const MAX_EMAIL_LENGTH = 254;

/** An optional email as typed: blank is none; anything else must have the shape of one address. */
export function bookerEmail(raw: string | null | undefined): Outcome<string | null> {
  const value = raw?.trim() ?? "";
  if (value === "") return { ok: true, value: null };
  const at = value.indexOf("@");
  const domain = value.slice(at + 1);
  const shaped =
    value.length <= MAX_EMAIL_LENGTH &&
    at > 0 &&
    value.lastIndexOf("@") === at &&
    domain.includes(".") &&
    !domain.startsWith(".") &&
    !domain.endsWith(".") &&
    ![...value].some((c) => c.trim() === "" || c === "<" || c === ">");
  return shaped ? { ok: true, value } : { ok: false, error: "That email does not look right. Check it, or leave it empty." };
}

/**
 * Book a held slot for the person who held it. The kernel gets an opaque label and nothing about the
 * person (NOT-02, GAP-02); their name and email go to booking-details, written after the kernel
 * booking so a refused commit leaves no row.
 */
export async function commitHold(
  deps: BookableDeps & { details: BookingDetailsStore },
  id: string,
  holdId: string,
  bookedBy: string,
  email: string | null = null
): Promise<Outcome<{ bookingId: string }>> {
  const record = deps.registry.get(id);
  if (!record) return { ok: false, error: "That bookable no longer exists." };
  // A hold placed before the owner switched to requests must not become a booking either.
  if (record.bookingMode === "request") return { ok: false, error: REQUESTS_ONLY };

  // Sanitized under the same rule as every other display string: the owner reads it.
  const name = ((): Outcome<string> => {
    try {
      return { ok: true, value: requireDisplayText(bookedBy, { field: "name", maxLength: MAX_BOOKER_NAME_LENGTH }) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "That name will not work." };
    }
  })();
  if (!name.ok) return name;
  const mail = bookerEmail(email);
  if (!mail.ok) return mail;

  // The hold id is a bare ULID, which SEC-03 says must never authorize a commit on its own. Here it is
  // 80 bits of randomness handed only to the browser that placed the hold, the app-tier version of
  // that guarantee rather than the signed capability MCP-T1 specifies.
  const committed = await deps.dt.holds.commit(holdId, { label: opaqueRef() }).then(
    ({ bookingId }) => bookingId,
    () => null
  );
  if (committed === null) return { ok: false, error: "That hold expired before it was confirmed. Pick the slot again." };
  // A failed write loses the name on the owner's side, never the booking the person was told about.
  await deps.details
    .put({ bookingId: committed, calendarId: id, name: name.value, email: mail.value, note: null, source: "web", createdAt: Date.now() })
    .catch(() => {});
  return { ok: true, value: { bookingId: committed } };
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
  deps: BookableDeps & { details: BookingDetailsStore },
  id: string,
  manageKey: string,
  window: { start: number; end: number }
): Promise<Outcome<BookingWithWho[]>> {
  if (!deps.registry.authorize(id, manageKey)) {
    return { ok: false, error: "That manage link does not open this bookable." };
  }
  return { ok: true, value: await withWho(deps.details, await deps.dt.bookings.get(id, window)) };
}
