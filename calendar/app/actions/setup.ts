"use server";

import { dt } from "@/lib/deltat";
import { config } from "@/lib/config";
import type { DayName, Schedule } from "@open-tap/client";

const resourceName = `cal:${config.slug}`;

export async function ensureCalendarResource(): Promise<string> {
  const roots = await dt.resources.get({ roots: true });
  const existing = roots.find((r) => r.name === resourceName);
  if (existing) return existing.id;

  const created = await dt.resources.create({ name: resourceName, capacity: 1 });
  return created.id;
}

export async function saveSchedule(input: {
  days: DayName[];
  startTime: string;
  endTime: string;
}): Promise<void> {
  const resourceId = await ensureCalendarResource();
  await dt.schedules.set({
    resourceId,
    days: input.days,
    startTime: input.startTime,
    endTime: input.endTime,
    utcOffsetMinutes: -new Date().getTimezoneOffset(),
  });
}

export async function getSchedule(): Promise<Schedule | null> {
  const resourceId = await ensureCalendarResource();
  return dt.schedules.get(resourceId);
}
