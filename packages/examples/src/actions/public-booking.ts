"use server";

import type { AvailabilitySlot, Booking } from "@open-deltat/client";
import { dtPublic } from "../lib/deltat";
import { publicRegistry } from "../lib/public-registry";
import * as service from "../lib/bookable-service";
import type { Outcome } from "../lib/bookable-service";
import { createRateLimiter } from "../lib/rate-limit";
import { callerIp } from "../lib/caller";

// The booking edge. Same split as the create side: rate limiting and caller identity here, the
// logic (including the registry gate on every entry point) in `lib/bookable-service`.

const deps = { dt: dtPublic, registry: publicRegistry };

const perCallerHolds = createRateLimiter({ limit: 20, windowMs: 3_600_000 });
const siteWideHolds = createRateLimiter({ limit: 600, windowMs: 3_600_000 });

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
  return service.holdSlot(deps, id, start, end);
}

export async function commitPublicHold(
  id: string,
  holdId: string,
  bookedBy: string
): Promise<Outcome<{ bookingId: string }>> {
  return service.commitHold(deps, id, holdId, bookedBy);
}

export async function releasePublicHold(id: string, holdId: string): Promise<void> {
  return service.releaseHold(deps, id, holdId);
}

export async function getPublicBookings(
  id: string,
  manageKey: string,
  window: { start: number; end: number }
): Promise<Outcome<Booking[]>> {
  return service.listBookings(deps, id, manageKey, window);
}
