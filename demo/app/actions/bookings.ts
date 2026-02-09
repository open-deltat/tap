"use server";

import * as db from "@/lib/db";
import * as store from "@/lib/store";
import { BookSlotInput, type Booking } from "@/lib/schemas";

export async function bookSlot(input: {
  resourceId: string;
  start: number;
  end: number;
  label?: string;
}): Promise<Booking> {
  const parsed = BookSlotInput.parse(input);
  const id = await db.bookSlot(parsed.resourceId, parsed.start, parsed.end);
  const booking: Booking = {
    id,
    resourceId: parsed.resourceId,
    start: parsed.start,
    end: parsed.end,
    label: parsed.label,
  };
  store.setBooking(booking);
  return booking;
}

export async function batchBookSlots(
  slots: { resourceId: string; start: number; end: number; label?: string }[]
): Promise<Booking[]> {
  if (slots.length === 0) return [];
  const dbSlots = slots.map((s) => ({
    resourceId: s.resourceId,
    start: s.start,
    end: s.end,
  }));
  const ids = await db.batchBookSlots(dbSlots);
  const bookings: Booking[] = ids.map((id, i) => ({
    id,
    resourceId: slots[i].resourceId,
    start: slots[i].start,
    end: slots[i].end,
    label: slots[i].label ?? "",
  }));
  for (const booking of bookings) {
    store.setBooking(booking);
  }
  return bookings;
}

export async function cancelBooking(id: string): Promise<void> {
  await db.cancelBooking(id);
  store.removeBooking(id);
}

export async function getBookingsForResource(
  resourceId: string
): Promise<Booking[]> {
  return store.getBookingsForResource(resourceId);
}

export async function getAllBookings(): Promise<Booking[]> {
  return store.getBookings();
}

export async function getMultiResourceBookings(
  resourceIds: string[]
): Promise<Record<string, Booking[]>> {
  const results = await Promise.all(
    resourceIds.map(async (id) => [id, store.getBookingsForResource(id)] as const)
  );
  return Object.fromEntries(results);
}
