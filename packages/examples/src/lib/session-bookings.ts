import { dt } from "./deltat";
import type { Booking } from "@open-deltat/client";

// Ephemeral demo bookings. Every booking a visitor makes is registered here with a short TTL;
// a module-level reaper cancels expired ones so the shared examples self-clean even if the
// visitor closes the tab. Seeded example bookings are never registered, so they persist.
//
// In-memory + grouped by session id. This lives in the long-running custom server process; all
// booking server actions share this module instance, so a registry + reaper here catches every
// visitor booking without touching server.ts.

export const BOOKING_TTL_MS = 30_000;
const SWEEP_MS = 2_000;

export interface TrackedBooking {
  booking: Booking;
  createdAt: number;
  expiresAt: number;
}

const bySession = new Map<string, TrackedBooking[]>();

let reaperStarted = false;
function ensureReaper(): void {
  if (reaperStarted) return;
  reaperStarted = true;
  setInterval(() => {
    const now = Date.now();
    const toCancel: string[] = [];
    for (const [sid, list] of bySession) {
      const keep: TrackedBooking[] = [];
      for (const t of list) {
        if (t.expiresAt <= now) toCancel.push(t.booking.id);
        else keep.push(t);
      }
      if (keep.length) bySession.set(sid, keep);
      else bySession.delete(sid);
    }
    for (const id of toCancel) {
      dt.bookings.cancel(id).catch(() => {});
    }
  }, SWEEP_MS);
}

export function trackBookings(sid: string, bookings: Booking[], now: number): void {
  if (bookings.length === 0) return;
  ensureReaper();
  const list = bySession.get(sid) ?? [];
  for (const booking of bookings) {
    list.push({ booking, createdAt: now, expiresAt: now + BOOKING_TTL_MS });
  }
  bySession.set(sid, list);
}

/** This session's still-active bookings, newest first, with their expiry timestamps. */
export function listBookings(sid: string): TrackedBooking[] {
  return (bySession.get(sid) ?? []).slice().sort((a, b) => b.createdAt - a.createdAt);
}

/** Forget a single booking (e.g. the visitor cancelled it themselves). */
export function untrack(sid: string, bookingId: string): void {
  const list = bySession.get(sid);
  if (!list) return;
  const next = list.filter((t) => t.booking.id !== bookingId);
  if (next.length) bySession.set(sid, next);
  else bySession.delete(sid);
}

/** Reset: cancel every booking this session made, now. */
export async function clearSession(sid: string): Promise<number> {
  const list = bySession.get(sid) ?? [];
  bySession.delete(sid);
  await Promise.allSettled(list.map((t) => dt.bookings.cancel(t.booking.id)));
  return list.length;
}
