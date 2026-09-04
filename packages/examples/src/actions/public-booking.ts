"use server";

import type { AvailabilitySlot, Booking } from "@open-deltat/client";
import { dtPublic } from "../lib/deltat";
import { publicRegistry } from "../lib/public-registry";
import { requireDisplayText } from "../lib/display-text";
import { createRateLimiter } from "../lib/rate-limit";
import { callerIp } from "../lib/caller";

// The booking side of a stranger-created bookable. Every entry point re-checks that the id is a
// registered public bookable: without that, these actions would be a generic read-and-write oracle
// over the whole public tenant rather than over one thing someone chose to publish.

/** Server-assigned, per MCP-T7: long enough to survive a human leaving to check with someone. */
const HOLD_TTL_MS = 5 * 60_000;

/** Matches the horizon open hours are written over, with slack for a timezone-shifted month view. */
const MAX_QUERY_WINDOW_MS = 62 * 24 * 60 * 60 * 1000;

const MAX_BOOKER_NAME_LENGTH = 60;

const perCallerHolds = createRateLimiter({ limit: 20, windowMs: 3_600_000 });
const siteWideHolds = createRateLimiter({ limit: 600, windowMs: 3_600_000 });

export type BookingResult<T> = { ok: true; value: T } | { ok: false; error: string };

export async function getPublicSlots(
  id: string,
  start: number,
  end: number
): Promise<AvailabilitySlot[]> {
  if (!publicRegistry.get(id)) return [];
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  // Clamp rather than reject: a client asking for a wider window gets the window we will serve,
  // and the per-resource sweep never runs over an unbounded span.
  const clampedEnd = Math.min(end, start + MAX_QUERY_WINDOW_MS);
  return dtPublic.availability.get({ resourceId: id, start, end: clampedEnd });
}

export async function holdPublicSlot(
  id: string,
  start: number,
  end: number
): Promise<BookingResult<{ holdId: string; expiresAt: number }>> {
  if (!publicRegistry.get(id)) {
    return { ok: false, error: "That bookable no longer exists." };
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { ok: false, error: "That is not a valid span of time." };
  }
  if (!perCallerHolds.check(await callerIp()).allowed || !siteWideHolds.check("site").allowed) {
    return { ok: false, error: "Too many holds from here just now. Give it a minute." };
  }

  try {
    // The expiry is ours to set, never the caller's: a client-chosen expiry is a client-chosen
    // squat. deltat rejects the hold outright if the span is already taken, which is the real
    // double-booking guard.
    const hold = await dtPublic.holds.place({
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

export async function commitPublicHold(
  id: string,
  holdId: string,
  bookedBy: string
): Promise<BookingResult<{ bookingId: string }>> {
  if (!publicRegistry.get(id)) {
    return { ok: false, error: "That bookable no longer exists." };
  }

  try {
    // GAP-02: `label` is still free text in the kernel, so this is the one place a stranger's
    // string reaches the WAL. Sanitized under the same rule as every other public display string
    // until `external_ref` lands and the name can live app-side against an opaque id.
    const label = requireDisplayText(bookedBy, { field: "name", maxLength: MAX_BOOKER_NAME_LENGTH });
    // The hold id is a bare ULID, which SEC-03 says must never authorize a commit on its own. Here
    // it is 80 bits of randomness handed only to the browser that placed the hold, which is the
    // app-tier version of that guarantee, not the signed capability MCP-T1 specifies.
    const { bookingId } = await dtPublic.holds.commit(holdId, { label });
    return { ok: true, value: { bookingId } };
  } catch (err) {
    if (err instanceof Error && /name/i.test(err.message)) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "That hold expired before it was confirmed. Pick the slot again." };
  }
}

/**
 * Give a slot back before the TTL does.
 *
 * Not required for correctness: an abandoned hold expires on its own, which is the whole point of
 * modelling a negotiation as expiring state. This just returns the slot in seconds instead of
 * minutes when someone changes their mind in front of us.
 */
export async function releasePublicHold(id: string, holdId: string): Promise<void> {
  if (!publicRegistry.get(id)) return;
  await dtPublic.holds.release(holdId).catch(() => {});
}

/** The owner's view of who booked. Gated on the manage key: the public page must never list this. */
export async function getPublicBookings(
  id: string,
  manageKey: string,
  window: { start: number; end: number }
): Promise<BookingResult<Booking[]>> {
  if (!publicRegistry.authorize(id, manageKey)) {
    return { ok: false, error: "That manage link does not open this bookable." };
  }
  return { ok: true, value: await dtPublic.bookings.get(id, window) };
}
