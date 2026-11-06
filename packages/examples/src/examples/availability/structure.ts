import type { DaySchedule } from "../../actions/schedule-window";

// The appointments calendar's shape: the seed builds it, and the hosted MCP's modelling guide
// describes it, from these same values.

export const NAME = "Dr. Sarah Chen";
export const SLOT_MINUTES = 30;

const WEEKDAY = [{ h: 9, m: 0, dur: 480 }];
/** Monday to Friday, 09:00 to 17:00. */
export const OFFICE_HOURS: DaySchedule = { 1: WEEKDAY, 2: WEEKDAY, 3: WEEKDAY, 4: WEEKDAY, 5: WEEKDAY };

/** Whole days off, as day offsets from the first seed (a week out and two weeks out). */
export const DAYS_OFF = [7, 14];
