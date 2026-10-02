"use server";

import { dt } from "../../lib/deltat";
import { getSessionId } from "../../lib/session";
import { BOOKING_TTL_MS, listBookings } from "../../lib/session-bookings";
import type { FieldSnapshot } from "../../lib/day-field";

// deltat refuses an availability query wider than 90 days, so a long window is read in chunks.
const CHUNK_MS = 84 * 86_400_000;
// The whole field never asks for more than this in one go: a bounded read, whatever the caller sends.
const MAX_WINDOW_MS = 400 * 86_400_000;

function chunks(start: number, end: number): [number, number][] {
  const count = Math.ceil((end - start) / CHUNK_MS);
  return Array.from({ length: count }, (_, i) => [start + i * CHUNK_MS, Math.min(end, start + (i + 1) * CHUNK_MS)]);
}

/**
 * One read of everything the field draws: free time, who is holding what, and what is booked. The demo
 * tenant is seeded fixtures and open by design; the booking ids of other visitors stay on the server.
 */
export async function readField(resourceId: string, start: number, end: number): Promise<FieldSnapshot> {
  const valid = resourceId.length > 0 && resourceId.length <= 64 && Number.isSafeInteger(start) && Number.isSafeInteger(end);
  if (!valid || end <= start || end - start > MAX_WINDOW_MS) throw new Error("Invalid window");

  const sid = await getSessionId();
  const mine = new Map((sid ? listBookings(sid) : []).map((t) => [t.booking.id, t.expiresAt]));
  const at = Date.now();

  const [free, holds, bookings] = await Promise.all([
    Promise.all(chunks(start, end).map(([from, to]) => dt.availability.get({ resourceId, start: from, end: to }))),
    dt.holds.get(resourceId, { start, end }),
    dt.bookings.get(resourceId, { start, end }),
  ]);

  return {
    free: free.flat().map(({ start: s, end: e }) => ({ start: s, end: e })),
    holds: holds.filter((h) => h.expiresAt > at).map((h) => ({ start: h.start, end: h.end, expiresAt: h.expiresAt })),
    busy: bookings.map((b) => (mine.has(b.id) ? { start: b.start, end: b.end, mine: true, id: b.id, expiresAt: mine.get(b.id) } : { start: b.start, end: b.end, mine: false })),
    at,
    bookingTtlMs: BOOKING_TTL_MS,
  };
}
