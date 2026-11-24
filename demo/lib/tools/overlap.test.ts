import { describe, expect, test } from "bun:test";
import { addDays, intersect, merge, planDay } from "./overlap";

const H = 3_600_000;
const utc = (iso: string) => Date.parse(iso);

describe("addDays", () => {
  test("crosses month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("intersect and merge", () => {
  test("half-open spans that only touch do not overlap", () => {
    expect(intersect([{ start: 0, end: 10 }], [{ start: 10, end: 20 }])).toEqual([]);
  });
  test("merge joins touching spans", () => {
    expect(merge([{ start: 10, end: 20 }, { start: 0, end: 10 }])).toEqual([{ start: 0, end: 20 }]);
  });
});

describe("planDay", () => {
  const nineToFive = (zone: string) => ({ zone, from: "09:00", to: "17:00" });

  test("Berlin and New York share two hours in winter", () => {
    const plan = planDay("2026-01-14", "Europe/Berlin", [nineToFive("Europe/Berlin"), nineToFive("America/New_York")]);
    expect(plan.overlap).toEqual([{ start: utc("2026-01-14T14:00:00Z"), end: utc("2026-01-14T16:00:00Z") }]);
  });

  test("in the March weeks when only the US has changed its clocks, they share three", () => {
    // The US moved to summer time on 8 March 2026, Europe on 29 March.
    const plan = planDay("2026-03-16", "Europe/Berlin", [nineToFive("Europe/Berlin"), nineToFive("America/New_York")]);
    expect(plan.overlap).toEqual([{ start: utc("2026-03-16T13:00:00Z"), end: utc("2026-03-16T16:00:00Z") }]);
  });

  test("the organiser's spring-forward day is 23 hours long", () => {
    const plan = planDay("2026-03-29", "Europe/Berlin", []);
    expect(plan.day.end - plan.day.start).toBe(23 * H);
    expect(plan.overlap).toEqual([]);
  });

  test("a working day that starts on the organiser's previous date still counts", () => {
    // 09:00 in Tokyo is 01:00 in Berlin the same day, so Tokyo's 09:00-17:00 shows as 01:00-09:00.
    const plan = planDay("2026-01-14", "Europe/Berlin", [nineToFive("Asia/Tokyo")]);
    expect(plan.working[0]).toEqual([{ start: utc("2026-01-14T00:00:00Z"), end: utc("2026-01-14T08:00:00Z") }]);
  });

  test("an overnight shift is split at the organiser's midnight", () => {
    const plan = planDay("2026-01-14", "UTC", [{ zone: "UTC", from: "22:00", to: "06:00" }]);
    expect(plan.working[0]).toEqual([
      { start: utc("2026-01-14T00:00:00Z"), end: utc("2026-01-14T06:00:00Z") },
      { start: utc("2026-01-14T22:00:00Z"), end: utc("2026-01-15T00:00:00Z") },
    ]);
  });

  test("no common time gives an empty overlap", () => {
    const plan = planDay("2026-01-14", "Europe/Berlin", [nineToFive("Europe/Berlin"), nineToFive("Pacific/Auckland")]);
    expect(plan.overlap).toEqual([]);
  });
});
