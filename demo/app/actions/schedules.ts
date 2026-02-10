"use server";

import { dt } from "@/lib/deltat";
import type { Schedule, DayName } from "@open-tap/client";

export async function setSchedule(input: {
  resourceId: string;
  days: DayName[];
  startTime: string;
  endTime: string;
}): Promise<Schedule> {
  return dt.schedules.set({
    ...input,
    utcOffsetMinutes: -new Date().getTimezoneOffset(),
  });
}

export async function getSchedule(
  resourceId: string
): Promise<Schedule | null> {
  return dt.schedules.get(resourceId);
}

export async function removeSchedule(resourceId: string): Promise<void> {
  return dt.schedules.remove(resourceId);
}
