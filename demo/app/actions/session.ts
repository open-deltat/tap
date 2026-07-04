"use server";

import { getSessionId } from "@open-deltat/examples/lib/session";
import { listBookings, clearSession, BOOKING_TTL_MS } from "@open-deltat/examples/lib/session-bookings";
import type { Booking } from "@open-deltat/client";

export async function getMyBookings(): Promise<{
  bookings: { booking: Booking; expiresAt: number }[];
  ttlMs: number;
}> {
  const sid = await getSessionId();
  if (!sid) return { bookings: [], ttlMs: BOOKING_TTL_MS };
  return {
    bookings: listBookings(sid).map((t) => ({ booking: t.booking, expiresAt: t.expiresAt })),
    ttlMs: BOOKING_TTL_MS,
  };
}

export async function clearMyBookings(): Promise<void> {
  const sid = await getSessionId();
  if (sid) await clearSession(sid);
}
