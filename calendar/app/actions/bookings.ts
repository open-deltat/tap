"use server";

import { dt } from "@/lib/deltat";
import { ensureCalendarResource } from "./setup";

export async function getBookings() {
  const resourceId = await ensureCalendarResource();
  return dt.bookings.get(resourceId);
}

export async function cancelBooking(bookingId: string) {
  await dt.bookings.cancel(bookingId);
}
