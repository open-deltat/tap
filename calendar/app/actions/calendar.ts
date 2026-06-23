"use server";

import { dt } from "@/lib/deltat";
import { requireSession } from "@/lib/auth";
import { ensureCalendarResource } from "@/lib/calendar-resource";

export async function getWeekData(weekStart: number, weekEnd: number) {
  await requireSession();
  const resourceId = await ensureCalendarResource();

  const [availability, bookings] = await Promise.all([
    dt.availability.get({ resourceId, start: weekStart, end: weekEnd }),
    dt.bookings.get(resourceId, { start: weekStart, end: weekEnd }),
  ]);

  return { availability, bookings };
}
