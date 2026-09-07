// The weekly-availability model shared by the builder UI and its seed. Pure helpers only, no
// server imports, so both the client editor and the "use server" seed can use it.

export interface TimeRange {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

/** Day-of-week (0=Sun..6=Sat) → its open ranges. A day with no ranges is "unavailable". */
export type WeekHours = Record<number, TimeRange[]>;

/** Monday-first display order, the way most weekly editors read. */
export const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const DOW_LABEL: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

/** A realistic working week: a morning and an afternoon block each weekday with a lunch gap, and
 * hours that vary by day (an early Friday finish). Weekends off. */
export const DEFAULT_WEEK: WeekHours = {
  1: [{ start: "08:00", end: "12:00" }, { start: "13:00", end: "17:00" }],
  2: [{ start: "09:00", end: "12:30" }, { start: "13:30", end: "18:00" }],
  3: [{ start: "08:00", end: "12:00" }, { start: "13:00", end: "16:00" }],
  4: [{ start: "09:00", end: "12:00" }, { start: "13:00", end: "17:30" }],
  5: [{ start: "08:00", end: "12:00" }, { start: "13:00", end: "15:00" }],
  6: [],
  0: [],
};

/** Flatten the weekly map into the flat ranges shape setWeeklyAvailability expects. */
export function weekToRanges(week: WeekHours): { dow: number; startTime: string; endTime: string }[] {
  const out: { dow: number; startTime: string; endTime: string }[] = [];
  for (const dow of DOW_ORDER) {
    for (const r of week[dow] ?? []) {
      if (r.end > r.start) out.push({ dow, startTime: r.start, endTime: r.end });
    }
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Today through `days` later, inclusive, as the date strings a recurrence is expanded over. */
export function dateRangeFromToday(days: number): { fromDate: string; toDate: string } {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + days);
  return { fromDate: toDateStr(from), toDate: toDateStr(to) };
}

/** Four weeks from today, the window the builder's recurrence is expanded over. */
export function builderDateRange(): { fromDate: string; toDate: string } {
  return dateRangeFromToday(27);
}

/** Compact hour label like "8a", "12p", "5p" for a minutes-from-midnight offset (axis tick labels). */
export function shortHour(offsetMs: number): string {
  const h = Math.round(offsetMs / 3_600_000);
  const ap = h < 12 || h === 24 ? "a" : "p";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}${ap}`;
}

/** Half-hour options "00:00".."23:30" for the time dropdowns. */
export const TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${pad(h)}:${m}`;
});

/** Rebuild the weekly editor state from the concrete rules deltat stores, so the editor always
 * reflects what is actually saved. Each weekday's distinct time-of-day ranges are collected once
 * (the same range repeats every week). Blocking rules are ignored, this edits open hours only. */
export function rulesToWeek(rules: { start: number; end: number; blocking?: boolean }[]): WeekHours {
  const week: WeekHours = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  const seen: Record<number, Set<string>> = { 0: new Set(), 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set(), 6: new Set() };
  const hhmm = (ms: number) => {
    const d = new Date(ms);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  for (const r of rules) {
    if (r.blocking) continue;
    const dow = new Date(r.start).getDay();
    const range = { start: hhmm(r.start), end: hhmm(r.end) };
    const key = `${range.start}-${range.end}`;
    if (seen[dow].has(key)) continue;
    seen[dow].add(key);
    week[dow].push(range);
  }
  for (const dow of DOW_ORDER) week[dow].sort((a, b) => a.start.localeCompare(b.start));
  return week;
}

