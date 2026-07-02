import { promises as fs } from "node:fs";
import path from "node:path";
import type { DayName } from "@open-deltat/client";

// The owner's recurring weekly availability. This is the edge's recurrence definition; deltat only
// ever stores its concrete projection as Rules (EDGE-01/EDGE-03), so the pattern itself lives here.
export interface WeeklySchedule {
  days: DayName[];
  startTime: string;
  endTime: string;
}

const scheduleFile = path.join(process.env.CAL_DATA_DIR ?? "data", "schedule.json");

export async function readSchedule(): Promise<WeeklySchedule | null> {
  try {
    return JSON.parse(await fs.readFile(scheduleFile, "utf8")) as WeeklySchedule;
  } catch {
    return null;
  }
}

export async function writeSchedule(schedule: WeeklySchedule): Promise<void> {
  await fs.mkdir(path.dirname(scheduleFile), { recursive: true });
  await fs.writeFile(scheduleFile, JSON.stringify(schedule, null, 2), "utf8");
}
