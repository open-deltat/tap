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
  return dt.bookings.create({
    resourceId: parsed.resourceId,
    start: parsed.start,
    end: parsed.end,
    label: parsed.label || undefined,
  });
}

export async function batchBookSlots(
  slots: { resourceId: string; start: number; end: number; label?: string }[]
): Promise<Booking[]> {
  if (slots.length === 0) return [];
  return dt.bookings.createMany(slots);
}

export async function cancelBooking(id: string): Promise<void> {
  await dt.bookings.cancel(id);
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
