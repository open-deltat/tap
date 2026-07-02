import { dt } from "@/lib/deltat";
import { expandRecurrence, type DayName } from "@open-tap/client";
import type { WeeklySchedule } from "@/lib/schedule-store";

const HORIZON_DAYS = 90;

const DAY_NUMBER: Record<DayName, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Replace the calendar's recurring open hours: expand the weekly pattern into concrete non-blocking
 * Rules over a 90-day horizon (the kernel never sees a recurrence pattern, EDGE-03). New hours are
 * added before the previous ones are removed, so a mid-run failure leaves the old schedule intact
 * rather than an empty one; duplicate open rules merge in availability. Blocking rules and bookings
 * are untouched.
 */
export async function projectScheduleToRules(
  resourceId: string,
  schedule: WeeklySchedule,
): Promise<void> {
  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + HORIZON_DAYS);

  const segments = expandRecurrence({
    daysOfWeek: schedule.days.map((d) => DAY_NUMBER[d]),
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    fromDate: toDateStr(today),
    toDate: toDateStr(horizon),
    blocking: false,
  });

  // Shared with the demo's setWeeklyAvailability: snapshot existing open hours, create the new
  // ones first, then delete the stale, so a mid-run failure never empties the schedule.
  await dt.rules.replaceOpenHours(resourceId, segments);
}
