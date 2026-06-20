"use server";

import { dt } from "@/lib/deltat";
import { requireSession } from "@/lib/auth";
import { ensureCalendarResource } from "./setup";

export async function getBookings() {
  await requireSession();
  const resourceId = await ensureCalendarResource();
  return dt.bookings.get(resourceId);
}

export async function cancelBooking(bookingId: string) {
  await requireSession();
  await dt.bookings.cancel(bookingId);
}
