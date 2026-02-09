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
  return dt.createBooking({
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
  return dt.createBookings(slots);
}

export async function cancelBooking(id: string): Promise<void> {
  await dt.cancelBooking(id);
}

export async function getBookingsForResource(
  resourceId: string
): Promise<Booking[]> {
  return dt.getBookings(resourceId);
}

export async function getAllBookings(): Promise<Booking[]> {
  // Get all resources, then all bookings for each
  const resources = await dt.getResources();
  const results = await Promise.all(
    resources.map((r) => dt.getBookings(r.id))
  );
  return results.flat();
}

export async function getMultiResourceBookings(
  resourceIds: string[]
): Promise<Record<string, Booking[]>> {
  const results = await Promise.all(
    resourceIds.map(async (id) => [id, await dt.getBookings(id)] as const)
  );
  return Object.fromEntries(results);
}
