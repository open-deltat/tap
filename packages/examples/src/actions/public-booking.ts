"use server";

import type { AvailabilitySlot, Booking } from "@open-deltat/client";
import { dtPublic } from "../lib/deltat";
import { publicRegistry } from "../lib/public-registry";
import * as service from "../lib/bookable-service";
import type { Outcome } from "../lib/bookable-service";
import { createRateLimiter } from "../lib/rate-limit";
import { callerIp } from "../lib/caller";
import { getSessionPrincipal } from "../lib/auth-session";
import { ReleaseHoldInput } from "../lib/hold-release";

// The booking edge. Same split as the create side: rate limiting and caller identity here, the
// logic (including the registry gate on every entry point) in `lib/bookable-service`.

const deps = { dt: dtPublic, registry: publicRegistry };

const HOUR_MS = 3_600_000;

const perCallerHolds = createRateLimiter({ limit: 20, windowMs: HOUR_MS });
const siteWideHolds = createRateLimiter({ limit: 600, windowMs: HOUR_MS });

// Releasing is bounded here rather than in the beacon route handler because this action is a public
// endpoint in its own right (a Next action id is discoverable in the page bundle), so the two share
// one limiter or neither is really limited. One hold legitimately produces up to three release
// attempts — the in-app cleanup, the teardown beacon, and the next mount's sweep — so the budget is
// five per hold: a visitor who reloads a few times never trips it, while an enumerator runs out of
// window long before it has guessed 80 bits of hold id.
const perCallerReleases = createRateLimiter({ limit: 100, windowMs: HOUR_MS });
const siteWideReleases = createRateLimiter({ limit: 3_000, windowMs: HOUR_MS });

export type BookingResult<T> = Outcome<T>;

export async function getPublicSlots(
  id: string,
  start: number,
  end: number
): Promise<AvailabilitySlot[]> {
  return service.listSlots(deps, id, start, end);
}

export async function holdPublicSlot(
  id: string,
  start: number,
  end: number
): Promise<Outcome<{ holdId: string; expiresAt: number }>> {
  if (!perCallerHolds.check(await callerIp()).allowed || !siteWideHolds.check("site").allowed) {
    return { ok: false, error: "Too many holds from here just now. Give it a minute." };
  }
  // Reading the schedule is always public; BOOKING can require an account. Enforced here rather
  // than in the UI, so hiding the button is a courtesy and this is the actual gate.
  const record = publicRegistry.get(id);
  if (record?.requireLoginToBook && !(await getSessionPrincipal())) {
    return { ok: false, error: "SIGN_IN_REQUIRED" };
  }
  return service.holdSlot(deps, id, start, end);
}

export async function commitPublicHold(
  id: string,
  holdId: string,
  bookedBy: string
): Promise<Outcome<{ bookingId: string }>> {
  return service.commitHold(deps, id, holdId, bookedBy);
}

/**
 * Give a held slot back. The one write on this surface that only ever subtracts, which is why it is
 * also reachable from the unauthenticated beacon route: the worst a caller can do with it is free a
 * slot they already hold the id for.
 *
 * Silent on rejection, deliberately. A release is best-effort by design (the TTL is the real
 * backstop) and its noisiest caller is a `sendBeacon` that is not around to read a reply, so an
 * outcome type here would be a return value nobody could act on.
 */
export async function releasePublicHold(id: string, holdId: string): Promise<void> {
  if (!ReleaseHoldInput.safeParse({ id, holdId }).success) return;
  if (!perCallerReleases.check(await callerIp()).allowed || !siteWideReleases.check("site").allowed) {
    return;
  }
  return service.releaseHold(deps, id, holdId);
}

export async function getPublicBookings(
  id: string,
  manageKey: string,
  window: { start: number; end: number }
): Promise<Outcome<Booking[]>> {
  return service.listBookings(deps, id, manageKey, window);
}
