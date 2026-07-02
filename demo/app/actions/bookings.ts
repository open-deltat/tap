"use server";

import { dt } from "@/lib/deltat";
import { BookSlotInput } from "@/lib/schemas";
import { releaseHoldsThenBook, type BookHeldSeatsInput } from "@/lib/booking-flow";
import { getSessionId } from "@/lib/session";
import { trackBookings, untrack } from "@/lib/session-bookings";
import type { Booking } from "@open-deltat/client";

// Register the bookings the visitor just made so the sidebar can show them and the reaper can
// auto-clear them after the TTL. Best-effort: never let tracking failure break a booking.
async function recordMine(bookings: Booking[]): Promise<void> {
  try {
    const sid = await getSessionId();
    if (sid) trackBookings(sid, bookings, Date.now());
  } catch {
    /* no session cookie (e.g. a script), nothing to track */
  }
}

async function forgetMine(ids: string[]): Promise<void> {
  try {
    const sid = await getSessionId();
    if (sid) for (const id of ids) untrack(sid, id);
  } catch {
    /* ignore */
  }
}

/**
 * Book seats the client currently holds. Releases each seat's hold before booking so the
 * atomic batch does not conflict with the client's own holds (see lib/booking-flow.ts).
 */
export async function bookHeldSeats(input: BookHeldSeatsInput): Promise<Booking[]> {
  const created = await releaseHoldsThenBook(dt, input);
  await recordMine(created);
  return created;
}

export async function bookSlot(input: {
  resourceId: string;
  start: number;
  end: number;
  label?: string;
}): Promise<Booking> {
  const parsed = BookSlotInput.parse(input);
  const [booking] = await dt.bookings.create([{
    resourceId: parsed.resourceId,
    start: parsed.start,
    end: parsed.end,
    label: parsed.label || undefined,
  }]);
  await recordMine([booking]);
  return booking;
}

export async function batchBookSlots(
  slots: { resourceId: string; start: number; end: number; label?: string }[]
): Promise<Booking[]> {
  if (slots.length === 0) return [];
  const created = await dt.bookings.create(slots);
  await recordMine(created);
  return created;
}

export async function cancelBooking(id: string): Promise<void> {
  await dt.bookings.cancel(id);
  await forgetMine([id]);
}

export async function cancelBookingWithMirror(
  bookingId: string,
  calendarResourceId: string,
  start: number,
  end: number
): Promise<void> {
  await dt.bookings.cancel(bookingId);
  const ids = [bookingId];
  const calBookings = await dt.bookings.get(calendarResourceId);
  const match = calBookings.find((b) => b.start === start && b.end === end);
  if (match) {
    await dt.bookings.cancel(match.id);
    ids.push(match.id);
  }
  await forgetMine(ids);
}

export async function getBookingsForResource(
  resourceId: string
): Promise<Booking[]> {
  return dt.bookings.get(resourceId);
}

export async function getMultiResourceBookings(
  resourceIds: string[]
): Promise<Record<string, Booking[]>> {
  return dt.bookings.getMany(resourceIds);
}
