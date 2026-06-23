import type { DayName } from "./types.js";

const DAY_BITS: Record<DayName, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

const BIT_DAYS: DayName[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Build a days_of_week bitmask from day names. Bit 0 = Sun, bit 6 = Sat. */
export function daysOfWeekMask(...days: DayName[]): number {
  let mask = 0;
  for (const d of days) mask |= 1 << DAY_BITS[d];
  return mask;
}

export function daysFromMask(mask: number): DayName[] {
  const days: DayName[] = [];
  for (let i = 0; i < 7; i++) {
    if (mask & (1 << i)) days.push(BIT_DAYS[i]);
  }
  return days;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Server-side local UTC offset in minutes (e.g. EST = -300, UTC = 0). */
export function localUtcOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}
