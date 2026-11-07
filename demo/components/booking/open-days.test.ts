import { describe, expect, test } from "bun:test";
import { dayKeyIn, firstOpenDay, keyOfPickerDate, noFreeTimesMessage, pickerDateOf, slotsByDay } from "./open-days";

// A calendar open only Monday and Tuesday 10:00 to 12:00 read as "nothing available": the page
// opened on today (a closed Saturday) and every date in the month looked the same. Which days are
// open comes from the one availability read the slot list uses, grouped by the calendar's own days.

const HOUR = 3_600_000;
const SLOT = 30 * 60_000;
const TZ = "Europe/Berlin";
// Saturday 2036-01-05 09:00 Berlin (08:00 UTC).
const NOW = Date.UTC(2036, 0, 5, 8);
const mon = Date.UTC(2036, 0, 7, 9); // Monday 10:00 Berlin
const tue = Date.UTC(2036, 0, 8, 9); // Tuesday 10:00 Berlin
const spans = [
  { start: mon, end: mon + 2 * HOUR },
  { start: tue, end: tue + 2 * HOUR },
];

describe("days from the availability read", () => {
  test("free spans become slots grouped by the calendar's own day", () => {
    const byDay = slotsByDay(spans, SLOT, NOW, TZ);
    expect([...byDay.keys()]).toEqual(["2036-01-07", "2036-01-08"]);
    expect(byDay.get("2036-01-07")?.length).toBe(4);
  });

  test("a day whose only span is too short for a slot, or already past, is not open", () => {
    const short = [{ start: mon, end: mon + 20 * 60_000 }];
    expect(slotsByDay(short, SLOT, NOW, TZ).size).toBe(0);
    expect(slotsByDay(spans, SLOT, tue + 2 * HOUR, TZ).size).toBe(0);
  });

  test("the day is the calendar's, not the viewer's: 23:30 in Berlin is still that Berlin day", () => {
    const late = Date.UTC(2036, 0, 7, 22, 30); // Monday 23:30 Berlin, already Tuesday in UTC
    expect(dayKeyIn(late, TZ)).toBe("2036-01-07");
  });
});

describe("the day the page opens on", () => {
  test("today when today has a free slot", () => {
    const byDay = slotsByDay(spans, SLOT, NOW, TZ);
    expect(firstOpenDay(byDay, "2036-01-07")).toBe("2036-01-07");
  });

  test("the first open day after a closed today", () => {
    const byDay = slotsByDay(spans, SLOT, NOW, TZ);
    expect(firstOpenDay(byDay, dayKeyIn(NOW, TZ))).toBe("2036-01-07");
  });

  test("none when nothing is free in the whole horizon", () => {
    expect(firstOpenDay(new Map(), "2036-01-05")).toBeNull();
  });
});

test("the empty horizon is said once, in weeks", () => {
  expect(noFreeTimesMessage(60)).toBe("No free times in the next 8 weeks.");
});

test("a calendar day and the date picker's local date map onto each other", () => {
  expect(keyOfPickerDate(pickerDateOf("2036-01-07"))).toBe("2036-01-07");
  expect(pickerDateOf("2036-12-31").getDate()).toBe(31);
});
