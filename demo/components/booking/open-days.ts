import { sliceIntoSlots, type Slot } from "./slots";

/** A day in the calendar's own time zone, as YYYY-MM-DD. Sorts as text in date order. */
export type DayKey = string;

export function dayKeyIn(ms: number, timeZone: string): DayKey {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(ms);
  const part = (type: "year" | "month" | "day") => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * The bookable slots in an availability read, by the calendar's day. A day is open exactly when it
 * has a slot here: the slot list and the month's open days come from this one read, never from the
 * rules, so they cannot disagree and a held or booked time never shows as free.
 */
export function slotsByDay(spans: readonly Slot[], slotMs: number, now: number, timeZone: string): ReadonlyMap<DayKey, Slot[]> {
  const slots = sliceIntoSlots([...spans], slotMs, now);
  const keys = [...new Set(slots.map((s) => dayKeyIn(s.start, timeZone)))].sort();
  return new Map(keys.map((key) => [key, slots.filter((s) => dayKeyIn(s.start, timeZone) === key)]));
}

/** The first day from `today` with a free slot, or null when the read has none. */
export function firstOpenDay(byDay: ReadonlyMap<DayKey, Slot[]>, today: DayKey): DayKey | null {
  return [...byDay.keys()].sort().find((key) => key >= today) ?? null;
}

/** The day asked for in the link (after signing in) when it still has a slot, else the first open day. */
export function openingDay(byDay: ReadonlyMap<DayKey, Slot[]>, today: DayKey, requested: string | null): DayKey | null {
  return requested !== null && requested >= today && byDay.has(requested) ? requested : firstOpenDay(byDay, today);
}

export const noFreeTimesMessage = (horizonDays: number): string =>
  `No free times in the next ${Math.floor(horizonDays / 7)} weeks.`;

// The date picker works in the viewer's local dates. A calendar day is shown on the picker cell with
// the same year, month and day, whatever the viewer's zone, so the two map by their parts.
export const keyOfPickerDate = (date: Date): DayKey =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function pickerDateOf(key: DayKey): Date {
  const [year = 0, month = 1, day = 1] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}
