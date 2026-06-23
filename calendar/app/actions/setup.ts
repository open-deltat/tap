"use server";

import { requireSession } from "@/lib/auth";
import { ensureCalendarResource } from "@/lib/calendar-resource";
import { projectScheduleToRules } from "@/lib/schedule-projection";
import { readSchedule, writeSchedule, type WeeklySchedule } from "@/lib/schedule-store";

export async function saveSchedule(input: WeeklySchedule): Promise<void> {
  await requireSession();
  const resourceId = await ensureCalendarResource();
  await projectScheduleToRules(resourceId, input);
  await writeSchedule(input);
}

export async function getSchedule(): Promise<WeeklySchedule | null> {
  await requireSession();
  return readSchedule();
}
