"use server";

import { dt } from "@/lib/deltat";
import { requireSession } from "@/lib/auth";
import { ensureCalendarResource } from "@/lib/calendar-resource";

export async function getBookings() {
  await requireSession();
  const resourceId = await ensureCalendarResource();
  return dt.bookings.get(resourceId);
}

export async function cancelBooking(bookingId: string) {
  await requireSession();
  // Verify the booking belongs to this calendar's resource before cancelling, so a caller
  // cannot cancel an arbitrary id elsewhere in the shared database.
  const resourceId = await ensureCalendarResource();
  const bookings = await dt.bookings.get(resourceId);
  if (!bookings.some((booking) => booking.id === bookingId)) {
    throw new Error("Booking not found");
  }
  await dt.bookings.cancel(bookingId);
}
