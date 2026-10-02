import { describe, expect, test } from "bun:test";
import {
  HOUR_MS,
  axisOf,
  cellsOfDay,
  countdown,
  dayStarts,
  diffField,
  dragSpan,
  durationLabel,
  firstDayOf,
  groupByDay,
  lastDayOf,
  mergeSlots,
  monthOf,
  neighbour,
  nearestFits,
  sliceSlots,
  stepSpan,
  toBlocks,
  widenAxis,
  type BusySlot,
  type DayRow,
  type FieldSnapshot,
  type HeldSlot,
  type Slot,
} from "./day-field";

const HALF_HOUR = HOUR_MS / 2;
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const slot = (day: number, hour: number, minute = 0): Slot => ({ start: at(day, hour, minute), end: at(day, hour, minute) + HALF_HOUR });
const heldSlot = (day: number, hour: number, expiresAt = 0): HeldSlot => ({ ...slot(day, hour), expiresAt });
const busySlot = (day: number, hour: number, mine = false): BusySlot => ({ ...slot(day, hour), mine });
const row = (day: number, slots: Slot[], held: HeldSlot[] = [], busy: BusySlot[] = []): DayRow => ({ dayStart: at(day, 0), slots, held, busy });

describe("sliceSlots", () => {
  test("cuts an open stretch into whole slots and drops a remainder shorter than one", () => {
    const open = [{ start: at(5, 9), end: at(5, 10, 45) }];
    expect(sliceSlots(open, HALF_HOUR).map((s) => s.start)).toEqual([at(5, 9), at(5, 9, 30), at(5, 10)]);
  });

  test("a stretch shorter than one slot yields nothing", () => {
    expect(sliceSlots([{ start: at(5, 9), end: at(5, 9, 20) }], HALF_HOUR)).toEqual([]);
  });
});

describe("groupByDay", () => {
  const starts = dayStarts(new Date(2026, 9, 5), 3);

  test("keeps an empty day as an empty row, so a closed day is visible", () => {
    const rows = groupByDay([slot(5, 9), slot(7, 9)], starts);
    expect(rows.map((r) => r.slots.length)).toEqual([1, 0, 1]);
  });

  test("puts a slot on the day it starts on", () => {
    const rows = groupByDay([slot(6, 23, 30)], starts);
    expect(rows[1].slots).toHaveLength(1);
    expect(rows[2].slots).toHaveLength(0);
  });

  test("keeps held slots apart from open ones, on their own day", () => {
    const rows = groupByDay([slot(5, 9)], starts, [heldSlot(6, 10, 123)]);
    expect(rows.map((r) => [r.slots.length, r.held.length])).toEqual([[1, 0], [0, 1], [0, 0]]);
    expect(rows[1].held[0].expiresAt).toBe(123);
  });

  test("ignores a slot outside the window instead of throwing", () => {
    expect(() => groupByDay([slot(20, 9)], starts, [heldSlot(1, 9)], [busySlot(30, 9)])).not.toThrow();
  });

  test("keeps booked slots on their own day, with who they belong to", () => {
    const rows = groupByDay([], starts, [], [busySlot(5, 9), busySlot(7, 9, true)]);
    expect(rows.map((r) => r.busy.length)).toEqual([1, 0, 1]);
    expect(rows[2].busy[0].mine).toBe(true);
  });
});

describe("toBlocks", () => {
  test("folds consecutive empty days into one closed block and keeps open days separate", () => {
    const rows = [row(2, []), row(3, []), row(4, []), row(5, [slot(5, 9)]), row(6, [slot(6, 9)]), row(7, []), row(8, [slot(8, 9)])];
    const blocks = toBlocks(rows);
    expect(blocks.map((b) => b.kind)).toEqual(["closed", "open", "open", "closed", "open"]);
    const first = blocks[0];
    expect(first.kind === "closed" && first.rows.length).toBe(3);
  });
});

describe("toBlocks across a month", () => {
  // Oct 31 2026 is a Saturday: a weekend that straddles the 1st of November.
  const dayRow = (month: number, day: number, slots: Slot[] = []): DayRow => ({ dayStart: new Date(2026, month, day).getTime(), slots, held: [], busy: [] });

  test("a closed run is cut where the month turns, so the 1st always starts a block", () => {
    const blocks = toBlocks([dayRow(9, 30, [slot(30, 9)]), dayRow(9, 31), dayRow(10, 1), dayRow(10, 2, [slot(2, 9)])]);
    expect(blocks.map((b) => [b.kind, monthOf(firstDayOf(b))])).toEqual([
      ["open", monthOf(new Date(2026, 9, 30).getTime())],
      ["closed", monthOf(new Date(2026, 9, 31).getTime())],
      ["closed", monthOf(new Date(2026, 10, 1).getTime())],
      ["open", monthOf(new Date(2026, 10, 2).getTime())],
    ]);
  });

  test("two closed days in the same month still fold into one", () => {
    const blocks = toBlocks([dayRow(9, 3), dayRow(9, 4)]);
    expect(blocks).toHaveLength(1);
    const only = blocks[0];
    expect(only.kind === "closed" && only.rows.length).toBe(2);
  });

  test("first and last day of a block", () => {
    const [block] = toBlocks([dayRow(9, 3), dayRow(9, 4)]);
    expect(firstDayOf(block)).toBe(new Date(2026, 9, 3).getTime());
    expect(lastDayOf(block)).toBe(new Date(2026, 9, 4).getTime());
  });
});

describe("toBlocks with held and booked time", () => {
  test("a fully booked day is an open row, not a closed one: full is not closed", () => {
    const blocks = toBlocks([row(5, [], [], [busySlot(5, 9)]), row(6, [], [heldSlot(6, 9)]), row(7, [])]);
    expect(blocks.map((b) => b.kind)).toEqual(["open", "open", "closed"]);
  });
});

describe("stepSpan", () => {
  const day = [slot(5, 9), slot(5, 9, 30), slot(5, 10), slot(5, 10, 30)];
  const one = slot(5, 9);

  test("grows by one slot when the next one is open", () => {
    expect(stepSpan(day, one, 1, HALF_HOUR, 4 * HOUR_MS).end).toBe(at(5, 10));
  });

  test("does not grow into a slot that is not open", () => {
    const gap = [slot(5, 9), slot(5, 10)];
    expect(stepSpan(gap, one, 1, HALF_HOUR, 4 * HOUR_MS)).toEqual(one);
  });

  test("does not grow past the maximum length", () => {
    const two = { start: at(5, 9), end: at(5, 10) };
    expect(stepSpan(day, two, 1, HALF_HOUR, HOUR_MS)).toEqual(two);
  });

  test("shrinks by one slot and stops at one", () => {
    const two = { start: at(5, 9), end: at(5, 10) };
    expect(stepSpan(day, two, -1, HALF_HOUR, 4 * HOUR_MS).end).toBe(at(5, 9, 30));
    expect(stepSpan(day, one, -1, HALF_HOUR, 4 * HOUR_MS)).toEqual(one);
  });
});

describe("diffField", () => {
  const snap = (free: Slot[], holds: HeldSlot[] = [], busy: BusySlot[] = []): FieldSnapshot => ({ free, holds, busy, at: 0, bookingTtlMs: 30_000 });
  const open = (...hours: number[]) => hours.map((h) => slot(5, h));
  const NOW = at(1, 0);

  test("a slot that went from open to booked by someone else is taken, and flashes", () => {
    const change = diffField(snap(open(9, 10)), snap(open(10), [], [busySlot(5, 9)]), HALF_HOUR, NOW);
    expect(change.taken.map((s) => s.start)).toEqual([at(5, 9)]);
    expect(change.message).toMatch(/taken$/);
  });

  test("a slot that went from open to held is held, and does not flash", () => {
    const change = diffField(snap(open(9, 10)), snap(open(10), [heldSlot(5, 9, 1)]), HALF_HOUR, NOW);
    expect(change.taken).toEqual([]);
    expect(change.message).toMatch(/held$/);
  });

  test("a slot that came free again is reported as free", () => {
    const change = diffField(snap(open(10), [heldSlot(5, 9, 1)]), snap(open(9, 10)), HALF_HOUR, NOW);
    expect(change.message).toMatch(/free again$/);
  });

  test("your own booking is not reported as someone else taking it", () => {
    const change = diffField(snap(open(9, 10)), snap(open(10), [], [busySlot(5, 9, true)]), HALF_HOUR, NOW);
    expect(change.taken).toEqual([]);
    expect(change.message).toBeNull();
  });

  test("your own held selection is left out, so placing a hold says nothing", () => {
    const mine = { start: at(5, 9), end: at(5, 10) };
    const change = diffField(snap(open(9, 10)), snap(open(10), [{ ...mine, expiresAt: 1 }]), HALF_HOUR, NOW, [mine]);
    expect(change.message).toBeNull();
  });

  test("a hold you just let go of coming free is not news either", () => {
    const mine = { start: at(5, 9), end: at(5, 10) };
    const change = diffField(snap(open(10), [{ ...mine, expiresAt: 1 }]), snap(open(9, 10)), HALF_HOUR, NOW, [mine]);
    expect(change.message).toBeNull();
  });

  test("days that only the later read covers are new, not 'free again'", () => {
    const farSlot = slot(20, 9);
    const change = diffField(snap(open(9)), snap([...open(9), farSlot]), HALF_HOUR, NOW, [], at(10, 0));
    expect(change.message).toBeNull();
  });

  test("without the window limit, the same new day would be reported", () => {
    const change = diffField(snap(open(9)), snap([...open(9), slot(20, 9)]), HALF_HOUR, NOW);
    expect(change.message).toMatch(/free again$/);
  });

  test("a slot that merely slid into the past is not 'taken'", () => {
    const change = diffField(snap(open(9, 10)), snap(open(10)), HALF_HOUR, at(5, 9, 45));
    expect(change.message).toBeNull();
  });

  test("booked beats held beats freed when several things happened", () => {
    const change = diffField(snap(open(9, 10, 11), [heldSlot(5, 14, 1)]), snap(open(11, 14), [heldSlot(5, 10, 1)], [busySlot(5, 9)]), HALF_HOUR, NOW);
    expect(change.message).toMatch(/taken$/);
  });
});

describe("widenAxis and mergeSlots", () => {
  test("the axis widens and never shrinks", () => {
    const wide = widenAxis({ fromHour: 9, toHour: 17 }, { fromHour: 8, toHour: 18 });
    expect(wide).toEqual({ fromHour: 8, toHour: 18 });
    expect(widenAxis(wide, { fromHour: 10, toHour: 12 })).toEqual(wide);
    expect(widenAxis(null, { fromHour: 10, toHour: 12 })).toEqual({ fromHour: 10, toHour: 12 });
  });

  test("merging counts a slot in both lists once and keeps time order", () => {
    const merged = mergeSlots([slot(5, 10), slot(5, 9)], [slot(5, 10), slot(5, 11)]);
    expect(merged.map((s) => s.start)).toEqual([at(5, 9), at(5, 10), at(5, 11)]);
  });
});

describe("dragSpan", () => {
  const day = [slot(5, 9), slot(5, 9, 30), slot(5, 10), slot(5, 10, 30), slot(5, 12), slot(5, 12, 30)];
  const run = (anchor: Slot, head: Slot, max = 4 * HOUR_MS) => dragSpan(day, anchor, head, HALF_HOUR, max);

  test("dragging right covers every slot from the anchor to the pointer", () => {
    expect(run(slot(5, 9), slot(5, 10))).toEqual({ start: at(5, 9), end: at(5, 10, 30) });
  });

  test("dragging left keeps the anchor at the right-hand end", () => {
    expect(run(slot(5, 10), slot(5, 9))).toEqual({ start: at(5, 9), end: at(5, 10, 30) });
  });

  test("stops at a slot that is not open instead of covering it", () => {
    expect(run(slot(5, 10, 30), slot(5, 12, 30))).toEqual({ start: at(5, 10, 30), end: at(5, 11) });
  });

  test("never grows past the maximum, however far the pointer goes", () => {
    expect(run(slot(5, 9), slot(5, 10, 30), HOUR_MS)).toEqual({ start: at(5, 9), end: at(5, 10) });
  });

  test("a drag that never leaves the anchor is the anchor", () => {
    expect(run(slot(5, 9), slot(5, 9))).toEqual(slot(5, 9));
  });
});

describe("cellsOfDay", () => {
  test("lists open, held and booked cells in time order, a booking covering every slot it touches", () => {
    const booked: BusySlot = { start: at(5, 10), end: at(5, 11), mine: false };
    const r = row(5, [slot(5, 9), slot(5, 11)], [heldSlot(5, 9, 99)].map((h) => ({ ...h, start: at(5, 9, 30), end: at(5, 10) })), [booked]);
    const cells = cellsOfDay(r, HALF_HOUR).map((c) => [c.kind, c.start]);
    expect(cells).toEqual([["free", at(5, 9)], ["held", at(5, 9, 30)], ["busy", at(5, 10)], ["busy", at(5, 10, 30)], ["free", at(5, 11)]]);
  });
});

describe("nearestFits", () => {
  const free = [slot(5, 9), slot(5, 9, 30), slot(5, 10), slot(5, 11), slot(5, 11, 30), slot(5, 14)];

  test("returns the closest places a single slot is open, never the refused one", () => {
    const got = nearestFits(free, slot(5, 10), HALF_HOUR, 2).map((s) => s.start);
    expect(got[0]).toBe(at(5, 9, 30));
    // 9:00 and 11:00 are equally far; either is a correct second.
    expect([at(5, 9), at(5, 11)]).toContain(got[1]);
    expect(got).not.toContain(at(5, 10));
  });

  test("a longer request only fits where enough contiguous time is open", () => {
    const hour = { start: at(5, 10), end: at(5, 11) };
    const got = nearestFits(free, hour, HALF_HOUR, 3).map((s) => [s.start, s.end]);
    // 9:30 to 10:30 is the closest run of two; 9:00 to 10:00 overlaps it so it is skipped; 11:00 to 12:00 fits.
    expect(got).toEqual([[at(5, 9, 30), at(5, 10, 30)], [at(5, 11), at(5, 12)]]);
  });

  test("never offers two overlapping alternatives", () => {
    const got = nearestFits(free, slot(5, 14), HALF_HOUR, 5);
    for (const a of got) for (const b of got) if (a !== b) expect(a.end <= b.start || b.end <= a.start).toBe(true);
  });
});

describe("durationLabel and countdown", () => {
  test("durations read the way a person says them", () => {
    expect([30, 60, 90, 120].map((m) => durationLabel(m * 60_000))).toEqual(["30 min", "1 h", "1 h 30 min", "2 h"]);
  });

  test("a countdown is m:ss and never goes negative", () => {
    expect(countdown(272_000)).toBe("4:32");
    expect(countdown(-5_000)).toBe("0:00");
  });
});

describe("axisOf", () => {
  test("spans from the earliest start to the latest end, rounded out to whole hours", () => {
    expect(axisOf([slot(5, 9, 30), slot(6, 16, 30)])).toEqual({ fromHour: 9, toHour: 17 });
  });

  test("falls back to 9 to 17 when nothing is open", () => {
    expect(axisOf([])).toEqual({ fromHour: 9, toHour: 17 });
  });
});

describe("neighbour", () => {
  const rows = [row(5, [slot(5, 9), slot(5, 9, 30), slot(5, 10)]), row(6, []), row(7, [slot(7, 9), slot(7, 10), slot(7, 11)])];

  test("right walks to the next open time, across days and over a closed one", () => {
    expect(neighbour(rows, slot(5, 10), "ArrowRight")).toEqual(slot(7, 9));
  });

  test("left is the mirror, and stops at the first time", () => {
    expect(neighbour(rows, slot(7, 9), "ArrowLeft")).toEqual(slot(5, 10));
    expect(neighbour(rows, slot(5, 9), "ArrowLeft")).toBeNull();
  });

  test("down keeps the time of day and skips a closed day", () => {
    expect(neighbour(rows, slot(5, 10), "ArrowDown")).toEqual(slot(7, 10));
  });

  test("down lands on the nearest time when the exact one is not open", () => {
    expect(neighbour(rows, slot(5, 9, 30), "ArrowDown")?.start).toBe(at(7, 9));
  });

  test("up goes back, and is null at the first open day", () => {
    expect(neighbour(rows, slot(7, 10), "ArrowUp")).toEqual(slot(5, 10));
    expect(neighbour(rows, slot(5, 10), "ArrowUp")).toBeNull();
  });

  test("home and end stay on the day", () => {
    expect(neighbour(rows, slot(7, 10), "Home")).toEqual(slot(7, 9));
    expect(neighbour(rows, slot(7, 10), "End")).toEqual(slot(7, 11));
  });
});
