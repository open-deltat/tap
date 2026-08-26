import { describe, expect, test } from "bun:test";
import { scheduleOccurrences, type DaySchedule } from "../schedule-window";

// Run under TZ=Europe/Berlin (see this package's test script) so the DST case is real: Berlin
// leaves summer time on the last Sunday of October, which a naive `+= 86_400_000` day step walks
// straight through, shifting every later occurrence by an hour.
const HOUR = 3_600_000;

function localMidnight(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

const NINE_TO_FIVE = [{ h: 9, m: 0, dur: 480 }];
const WEEKDAYS: DaySchedule = { 1: NINE_TO_FIVE, 2: NINE_TO_FIVE, 3: NINE_TO_FIVE, 4: NINE_TO_FIVE, 5: NINE_TO_FIVE };
const EVERY_DAY: DaySchedule = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, NINE_TO_FIVE]));

describe("scheduleOccurrences", () => {
  test("lays down the whole horizon when the resource has no open hours yet", () => {
    const today = localMidnight(2026, 8, 26); // a Wednesday
    const occ = scheduleOccurrences(EVERY_DAY, { today, coveredThrough: 0, horizonDays: 10 });

    expect(occ).toHaveLength(10);
    expect(occ[0].start).toBe(today + 9 * HOUR);
    expect(occ[0].end).toBe(today + 17 * HOUR);
  });

  test("emits only the uncovered tail when open hours already reach into the future", () => {
    const today = localMidnight(2026, 8, 26);
    const coveredThrough = localMidnight(2026, 8, 29) + 17 * HOUR; // seeded through Saturday's close
    const occ = scheduleOccurrences(EVERY_DAY, { today, coveredThrough, horizonDays: 10 });

    // Days 0-3 are already covered, so only days 4-9 are new.
    expect(occ).toHaveLength(6);
    expect(occ[0].start).toBe(localMidnight(2026, 8, 30) + 9 * HOUR);
    expect(occ.every((o) => o.start >= coveredThrough)).toBe(true);
  });

  test("restarts from today when the seeded window has entirely lapsed, without backfilling the past", () => {
    const today = localMidnight(2026, 8, 26);
    const coveredThrough = localMidnight(2026, 7, 24) + 17 * HOUR; // the production symptom
    const occ = scheduleOccurrences(EVERY_DAY, { today, coveredThrough, horizonDays: 10 });

    expect(occ).toHaveLength(10);
    expect(occ[0].start).toBe(today + 9 * HOUR);
    expect(occ.every((o) => o.start >= today)).toBe(true);
  });

  test("honors the day-of-week map", () => {
    const today = localMidnight(2026, 8, 29); // Saturday
    const occ = scheduleOccurrences(WEEKDAYS, { today, coveredThrough: 0, horizonDays: 7 });

    // Sat + Sun are closed, so a 7-day horizon from Saturday yields Mon-Fri only.
    expect(occ).toHaveLength(5);
    expect(new Date(occ[0].start).getDay()).toBe(1);
  });

  test("steps by calendar day, so a DST change moves the clock and not the schedule", () => {
    const today = localMidnight(2026, 10, 20); // Berlin leaves summer time on Oct 25
    const occ = scheduleOccurrences(EVERY_DAY, { today, coveredThrough: 0, horizonDays: 14 });

    expect(occ).toHaveLength(14);
    for (const o of occ) {
      expect(new Date(o.start).getHours()).toBe(9);
      expect(new Date(o.end).getHours()).toBe(17);
    }
  });

  test("`from` backfills before today on a first seed, and is ignored once coverage exists", () => {
    const today = localMidnight(2026, 8, 26);
    const from = localMidnight(2026, 8, 1); // the gym's "current month" backfill

    const first = scheduleOccurrences(EVERY_DAY, { today, coveredThrough: 0, horizonDays: 10, from });
    expect(first[0].start).toBe(from + 9 * HOUR);

    const covered = localMidnight(2026, 9, 2) + 17 * HOUR;
    const topUp = scheduleOccurrences(EVERY_DAY, { today, coveredThrough: covered, horizonDays: 10, from });
    expect(topUp.every((o) => o.start > covered)).toBe(true);
  });

  test("abutting full-day windows leave no midnight gap, DST night included", () => {
    const today = localMidnight(2026, 10, 22); // the horizon below spans the Oct 25 change
    const allDay: DaySchedule = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, [{ h: 0, m: 0, dur: 1440 }]]));
    const occ = scheduleOccurrences(allDay, { today, coveredThrough: 0, horizonDays: 6 });

    for (let i = 1; i < occ.length; i++) expect(occ[i].start).toBe(occ[i - 1].end);
  });
});
