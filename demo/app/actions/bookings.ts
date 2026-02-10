"use server";

import { dt } from "@/lib/deltat";
import { BookSlotInput } from "@/lib/schemas";
import type { Booking } from "@open-tap/client";

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
  return booking;
}

export async function batchBookSlots(
  slots: { resourceId: string; start: number; end: number; label?: string }[]
): Promise<Booking[]> {
  if (slots.length === 0) return [];
  return dt.bookings.create(slots);
}

export async function cancelBooking(id: string): Promise<void> {
  await dt.bookings.cancel(id);
}

export async function cancelBookingWithMirror(
  bookingId: string,
  calendarResourceId: string,
  start: number,
  end: number
): Promise<void> {
  await dt.bookings.cancel(bookingId);
  const calBookings = await dt.bookings.get(calendarResourceId);
  const match = calBookings.find((b) => b.start === start && b.end === end);
  if (match) {
    await dt.bookings.cancel(match.id);
  }
}

export async function getBookingsForResource(
  resourceId: string
): Promise<Booking[]> {
  return dt.bookings.get(resourceId);
}

export async function getAllBookings(): Promise<Booking[]> {
  const resources = await dt.resources.get();
  const results = await Promise.all(
    resources.map((r) => dt.bookings.get(r.id))
  );
  return results.flat();
}

export async function getMultiResourceBookings(
  resourceIds: string[]
): Promise<Record<string, Booking[]>> {
  const results = await Promise.all(
    resourceIds.map(async (id) => [id, await dt.bookings.get(id)] as const)
  );
  return Object.fromEntries(results);
}

export async function clearBookingsForResource(resourceId: string): Promise<number> {
  const bookings = await dt.bookings.get(resourceId);
  await Promise.all(bookings.map((b) => dt.bookings.cancel(b.id)));
  return bookings.length;
}
