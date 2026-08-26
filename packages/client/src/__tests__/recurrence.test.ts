import { describe, expect, test } from "bun:test";
import { expandRecurrence } from "../recurrence.js";

// All expectations are absolute Unix ms built with Date.UTC, so they are valid regardless of the
// TZ environment variable the test process runs under. That is the point: expansion must depend
// only on the pattern's timeZone field, never on the host.

describe("expandRecurrence explicit segments", () => {
  test("passes segments through and defaults blocking to false", () => {
    expect(
      expandRecurrence([
        { start: 1, end: 2 },
        { start: 3, end: 4, blocking: true },
      ])
    ).toEqual([
      { start: 1, end: 2, blocking: false },
      { start: 3, end: 4, blocking: true },
    ]);
  });
});

describe("expandRecurrence UTC default", () => {
  test("expands weekdays 09:00-17:00 as UTC wall times", () => {
    const segments = expandRecurrence({
      daysOfWeek: [1, 2, 3, 4, 5],
      startTime: "09:00",
      endTime: "17:00",
      fromDate: "2025-01-06",
      toDate: "2025-01-10",
    });
    expect(segments).toEqual(
      [6, 7, 8, 9, 10].map((day) => ({
        start: Date.UTC(2025, 0, day, 9),
        end: Date.UTC(2025, 0, day, 17),
        blocking: false,
      }))
    );
  });

  test("propagates blocking to every segment", () => {
    const segments = expandRecurrence({
      daysOfWeek: [1],
      startTime: "09:00",
      endTime: "17:00",
      fromDate: "2025-01-06",
      toDate: "2025-01-06",
      blocking: true,
    });
    expect(segments).toEqual([
      { start: Date.UTC(2025, 0, 6, 9), end: Date.UTC(2025, 0, 6, 17), blocking: true },
    ]);
  });
});

describe("expandRecurrence date range", () => {
  test("toDate is inclusive", () => {
    const segments = expandRecurrence({
      daysOfWeek: [0],
      startTime: "09:00",
      endTime: "17:00",
      fromDate: "2025-01-06",
      toDate: "2025-01-12",
    });
    expect(segments).toEqual([
      { start: Date.UTC(2025, 0, 12, 9), end: Date.UTC(2025, 0, 12, 17), blocking: false },
    ]);
  });

  test("a single-day range matching its day of week yields one segment", () => {
    const segments = expandRecurrence({
      daysOfWeek: [1],
      startTime: "09:00",
      endTime: "10:00",
      fromDate: "2025-01-06",
      toDate: "2025-01-06",
    });
    expect(segments).toHaveLength(1);
  });

  test("fromDate after toDate yields no segments", () => {
    expect(
      expandRecurrence({
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startTime: "09:00",
        endTime: "17:00",
        fromDate: "2025-01-10",
        toDate: "2025-01-06",
      })
    ).toEqual([]);
  });

  test("empty daysOfWeek yields no segments", () => {
    expect(
      expandRecurrence({
        daysOfWeek: [],
        startTime: "09:00",
        endTime: "17:00",
        fromDate: "2025-01-06",
        toDate: "2025-01-10",
      })
    ).toEqual([]);
  });

  test("a range containing no matching day yields no segments", () => {
    expect(
      expandRecurrence({
        daysOfWeek: [0],
        startTime: "09:00",
        endTime: "17:00",
        fromDate: "2025-01-06",
        toDate: "2025-01-06",
      })
    ).toEqual([]);
  });
});

describe("expandRecurrence days of week", () => {
  // 2025-01-05 is a Sunday, 2025-01-11 a Saturday.
  test("0 is Sunday and 6 is Saturday", () => {
    const segments = expandRecurrence({
      daysOfWeek: [0, 6],
      startTime: "09:00",
      endTime: "10:00",
      fromDate: "2025-01-05",
      toDate: "2025-01-11",
    });
    expect(segments.map((s) => s.start)).toEqual([
      Date.UTC(2025, 0, 5, 9),
      Date.UTC(2025, 0, 11, 9),
    ]);
  });

  test("3 is Wednesday", () => {
    const segments = expandRecurrence({
      daysOfWeek: [3],
      startTime: "09:00",
      endTime: "10:00",
      fromDate: "2025-01-05",
      toDate: "2025-01-11",
    });
    expect(segments.map((s) => s.start)).toEqual([Date.UTC(2025, 0, 8, 9)]);
  });
});

describe("expandRecurrence excludeDates", () => {
  test("skips excluded calendar days", () => {
    const segments = expandRecurrence({
      daysOfWeek: [1, 2, 3, 4, 5],
      startTime: "09:00",
      endTime: "17:00",
      fromDate: "2025-01-06",
      toDate: "2025-01-10",
      excludeDates: ["2025-01-08"],
    });
    expect(segments.map((s) => s.start)).toEqual(
      [6, 7, 9, 10].map((day) => Date.UTC(2025, 0, day, 9))
    );
  });
});

describe("expandRecurrence DST spring forward (America/New_York, 2026-03-08)", () => {
  test("preserves wall-clock times across the transition", () => {
    const segments = expandRecurrence({
      daysOfWeek: [6, 0, 1],
      startTime: "09:00",
      endTime: "17:00",
      fromDate: "2026-03-07",
      toDate: "2026-03-09",
      timeZone: "America/New_York",
    });
    expect(segments).toEqual([
      // Saturday is still EST (UTC-5).
      { start: Date.UTC(2026, 2, 7, 14), end: Date.UTC(2026, 2, 7, 22), blocking: false },
      // Sunday and Monday are EDT (UTC-4): same wall time, different absolute offset.
      { start: Date.UTC(2026, 2, 8, 13), end: Date.UTC(2026, 2, 8, 21), blocking: false },
      { start: Date.UTC(2026, 2, 9, 13), end: Date.UTC(2026, 2, 9, 21), blocking: false },
    ]);
  });

  test("a nonexistent gap time shifts forward by the gap", () => {
    const segments = expandRecurrence({
      daysOfWeek: [0],
      startTime: "02:30",
      endTime: "05:00",
      fromDate: "2026-03-08",
      toDate: "2026-03-08",
      timeZone: "America/New_York",
    });
    // 02:30 does not exist on 2026-03-08; it resolves to 03:30 EDT.
    expect(segments).toEqual([
      { start: Date.UTC(2026, 2, 8, 7, 30), end: Date.UTC(2026, 2, 8, 9), blocking: false },
    ]);
  });

  test("a window inverted by the gap is skipped for that day only", () => {
    // start 02:30 shifts forward to 03:30 EDT, past the 03:00 end, so the day yields nothing.
    expect(
      expandRecurrence({
        daysOfWeek: [0],
        startTime: "02:30",
        endTime: "03:00",
        fromDate: "2026-03-08",
        toDate: "2026-03-08",
        timeZone: "America/New_York",
      })
    ).toEqual([]);
  });
});

describe("expandRecurrence DST fall back (America/New_York, 2026-11-01)", () => {
  test("preserves wall-clock times across the transition", () => {
    const segments = expandRecurrence({
      daysOfWeek: [6, 0],
      startTime: "09:00",
      endTime: "17:00",
      fromDate: "2026-10-31",
      toDate: "2026-11-01",
      timeZone: "America/New_York",
    });
    expect(segments).toEqual([
      // Saturday is EDT (UTC-4), Sunday is back to EST (UTC-5).
      { start: Date.UTC(2026, 9, 31, 13), end: Date.UTC(2026, 9, 31, 21), blocking: false },
      { start: Date.UTC(2026, 10, 1, 14), end: Date.UTC(2026, 10, 1, 22), blocking: false },
    ]);
  });

  test("an ambiguous repeated time resolves to the earlier instant", () => {
    const segments = expandRecurrence({
      daysOfWeek: [0],
      startTime: "01:30",
      endTime: "03:00",
      fromDate: "2026-11-01",
      toDate: "2026-11-01",
      timeZone: "America/New_York",
    });
    // 01:30 occurs twice on 2026-11-01; the EDT (first) occurrence wins.
    expect(segments).toEqual([
      { start: Date.UTC(2026, 10, 1, 5, 30), end: Date.UTC(2026, 10, 1, 8), blocking: false },
    ]);
  });
});

describe("expandRecurrence DST in Europe/Berlin", () => {
  test("spring-forward gap time shifts forward (2026-03-29)", () => {
    const segments = expandRecurrence({
      daysOfWeek: [0],
      startTime: "02:30",
      endTime: "09:00",
      fromDate: "2026-03-29",
      toDate: "2026-03-29",
      timeZone: "Europe/Berlin",
    });
    // 02:30 does not exist on 2026-03-29; it resolves to 03:30 CEST.
    expect(segments).toEqual([
      { start: Date.UTC(2026, 2, 29, 1, 30), end: Date.UTC(2026, 2, 29, 7), blocking: false },
    ]);
  });

  test("fall-back ambiguous time resolves to the earlier instant (2026-10-25)", () => {
    const segments = expandRecurrence({
      daysOfWeek: [0],
      startTime: "02:30",
      endTime: "09:00",
      fromDate: "2026-10-25",
      toDate: "2026-10-25",
      timeZone: "Europe/Berlin",
    });
    // 02:30 occurs twice on 2026-10-25; the CEST (first) occurrence wins.
    expect(segments).toEqual([
      { start: Date.UTC(2026, 9, 25, 0, 30), end: Date.UTC(2026, 9, 25, 8), blocking: false },
    ]);
  });
});

describe("expandRecurrence overnight and until-midnight windows", () => {
  test("an endTime before startTime rolls into the next day", () => {
    const segments = expandRecurrence({
      daysOfWeek: [1, 2],
      startTime: "22:00",
      endTime: "02:00",
      fromDate: "2025-01-06",
      toDate: "2025-01-07",
    });
    expect(segments).toEqual([
      { start: Date.UTC(2025, 0, 6, 22), end: Date.UTC(2025, 0, 7, 2), blocking: false },
      { start: Date.UTC(2025, 0, 7, 22), end: Date.UTC(2025, 0, 8, 2), blocking: false },
    ]);
  });

  test('"00:00" as endTime means next-day midnight', () => {
    const segments = expandRecurrence({
      daysOfWeek: [1],
      startTime: "09:00",
      endTime: "00:00",
      fromDate: "2025-01-06",
      toDate: "2025-01-06",
    });
    expect(segments).toEqual([
      { start: Date.UTC(2025, 0, 6, 9), end: Date.UTC(2025, 0, 7), blocking: false },
    ]);
  });

  test('"24:00" as endTime means next-day midnight', () => {
    const segments = expandRecurrence({
      daysOfWeek: [1],
      startTime: "09:00",
      endTime: "24:00",
      fromDate: "2025-01-06",
      toDate: "2025-01-06",
    });
    expect(segments).toEqual([
      { start: Date.UTC(2025, 0, 6, 9), end: Date.UTC(2025, 0, 7), blocking: false },
    ]);
  });

  test('"00:00" to "24:00" is a full-day window', () => {
    const segments = expandRecurrence({
      daysOfWeek: [1],
      startTime: "00:00",
      endTime: "24:00",
      fromDate: "2025-01-06",
      toDate: "2025-01-06",
    });
    expect(segments).toEqual([
      { start: Date.UTC(2025, 0, 6), end: Date.UTC(2025, 0, 7), blocking: false },
    ]);
  });

  test("an overnight window ending in a DST gap shifts its end forward", () => {
    const segments = expandRecurrence({
      daysOfWeek: [6],
      startTime: "22:00",
      endTime: "02:00",
      fromDate: "2026-03-07",
      toDate: "2026-03-07",
      timeZone: "America/New_York",
    });
    // Saturday 22:00 EST; Sunday 02:00 does not exist and resolves to 03:00 EDT.
    expect(segments).toEqual([
      { start: Date.UTC(2026, 2, 8, 3), end: Date.UTC(2026, 2, 8, 7), blocking: false },
    ]);
  });
});

describe("expandRecurrence validation", () => {
  const base = {
    daysOfWeek: [1],
    startTime: "09:00",
    endTime: "17:00",
    fromDate: "2025-01-06",
    toDate: "2025-01-06",
  };

  test("throws on malformed startTime", () => {
    expect(() => expandRecurrence({ ...base, startTime: "9am" })).toThrow("startTime");
    expect(() => expandRecurrence({ ...base, startTime: "09" })).toThrow("startTime");
    expect(() => expandRecurrence({ ...base, startTime: "" })).toThrow("startTime");
    expect(() => expandRecurrence({ ...base, startTime: "09:60" })).toThrow("startTime");
    expect(() => expandRecurrence({ ...base, startTime: "24:00" })).toThrow("startTime");
  });

  test("throws on malformed endTime", () => {
    expect(() => expandRecurrence({ ...base, endTime: "25:00" })).toThrow("endTime");
    expect(() => expandRecurrence({ ...base, endTime: "24:30" })).toThrow("endTime");
    expect(() => expandRecurrence({ ...base, endTime: "17:0x" })).toThrow("endTime");
  });

  test("throws when endTime equals startTime", () => {
    expect(() => expandRecurrence({ ...base, endTime: "09:00" })).toThrow("equals");
  });

  test("throws on malformed or impossible dates", () => {
    expect(() => expandRecurrence({ ...base, fromDate: "2025-02-30" })).toThrow("fromDate");
    expect(() => expandRecurrence({ ...base, toDate: "not-a-date" })).toThrow("toDate");
    expect(() => expandRecurrence({ ...base, fromDate: "2025-13-01" })).toThrow("fromDate");
  });

  test("throws on an unknown timeZone", () => {
    expect(() => expandRecurrence({ ...base, timeZone: "Not/AZone" })).toThrow();
  });
});
