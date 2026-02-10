"use server";

import { dt } from "@/lib/deltat";
import { ensureCalendarResource } from "./setup";

export async function getWeekData(weekStart: number, weekEnd: number) {
  const resourceId = await ensureCalendarResource();

  const [availability, bookings] = await Promise.all([
    dt.availability.get({ resourceId, start: weekStart, end: weekEnd }),
    dt.bookings.get(resourceId, { start: weekStart, end: weekEnd }),
  ]);

  return { availability, bookings };
}
