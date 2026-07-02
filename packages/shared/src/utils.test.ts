import { test, expect } from "bun:test";
import { weekStart, weekEnd } from "./utils.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

test("weekStart is Monday 00:00 local for a mid-week date", () => {
  // 2026-07-02 is a Thursday; its week starts Monday 2026-06-29.
  const start = weekStart(new Date("2026-07-02T15:30:00"));
  expect(start.getDay()).toBe(1);
  expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0]);
  expect(start.getDate()).toBe(29);
  expect(start.getMonth()).toBe(5); // June
});

test("weekStart treats Sunday as the end of the prior week, not the start", () => {
  // 2026-07-05 is a Sunday; its week still starts Monday 2026-06-29.
  const start = weekStart(new Date("2026-07-05T09:00:00"));
  expect(start.getDay()).toBe(1);
  expect(start.getDate()).toBe(29);
});

test("weekEnd is the exclusive half-open bound: exactly 7 days after weekStart", () => {
  const d = new Date("2026-07-02T15:30:00");
  const span = weekEnd(d).getTime() - weekStart(d).getTime();
  // Regression: weekEnd used to return start + 7d - 1ms, dropping the week's final millisecond.
  expect(span).toBe(WEEK_MS);
});

test("weekEnd lands on the next Monday 00:00", () => {
  const end = weekEnd(new Date("2026-07-02T15:30:00"));
  expect(end.getDay()).toBe(1);
  expect(end.getDate()).toBe(6); // Monday 2026-07-06
});
