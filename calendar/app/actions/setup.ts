"use server";

import { dt } from "@/lib/deltat";
import { requireSession } from "@/lib/auth";
import { ensureCalendarResource } from "@/lib/calendar-resource";
import { localUtcOffsetMinutes } from "@open-tap/client";
import type { DayName, Schedule } from "@open-tap/client";

export async function saveSchedule(input: {
  days: DayName[];
  startTime: string;
  endTime: string;
}): Promise<void> {
  await requireSession();
  const resourceId = await ensureCalendarResource();
  await dt.schedules.set({
    resourceId,
    days: input.days,
    startTime: input.startTime,
    endTime: input.endTime,
    utcOffsetMinutes: localUtcOffsetMinutes(),
  });
}

export async function getSchedule(): Promise<Schedule | null> {
  await requireSession();
  const resourceId = await ensureCalendarResource();
  return dt.schedules.get(resourceId);
}
