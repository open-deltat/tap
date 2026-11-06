import { describe, expect, test } from "bun:test";
import { rollOpenHours, saveAvailability } from "../owned-calendar-service";
import { dateRangeInZone } from "../../examples/builder/schedule";
import { NOW, OWNER, setupMeetings } from "./meeting-fixtures";

// Open hours are written as concrete rules HORIZON_DAYS ahead, on a save. Nothing else wrote them, so
// a calendar nobody re-saved ran out of open hours two months later and took no more bookings.

const DAY = 86_400_000;
const weekdays = { 1: [{ start: "09:00", end: "17:00" }], 2: [{ start: "09:00", end: "17:00" }], 3: [{ start: "09:00", end: "17:00" }], 4: [{ start: "09:00", end: "17:00" }], 5: [{ start: "09:00", end: "17:00" }] };
const mornings = { 1: [{ start: "09:00", end: "12:00" }] };

function setup() {
  const meetings = setupMeetings();
  const clock = { now: NOW };
  const deps = { dt: meetings.dt, registry: meetings.registry, now: () => clock.now };
  const save = (week: Record<number, { start: string; end: string }[]>) =>
    saveAvailability(deps, { id: "cal1", owner: OWNER, week, slotMinutes: 30, priceCents: null });
  const hours = () => meetings.state.openHours.get("cal1") ?? [];
  return { ...meetings, clock, deps, save, hours };
}

const openOn = (segments: readonly { start: number; end: number }[], from: number, to: number) =>
  segments.some((s) => s.start < to && s.end > from);

describe("the daily roll-forward", () => {
  test("a calendar saved 61 days ago is bookable again after the job", async () => {
    const { clock, deps, save, hours } = setup();
    expect((await save(weekdays)).ok).toBe(true);

    clock.now = NOW + 61 * DAY;
    const nextWeek = [clock.now, clock.now + 7 * DAY] as const;
    expect(openOn(hours(), ...nextWeek)).toBe(false); // ran out: nothing to book

    const report = await rollOpenHours(deps);
    expect(report).toEqual({ rolled: ["cal1"], failed: [] });
    expect(openOn(hours(), ...nextWeek)).toBe(true);
    expect(openOn(hours(), clock.now + 59 * DAY, clock.now + 61 * DAY)).toBe(true);
  });

  test("it writes exactly what a save of the same pattern writes today, however often it runs", async () => {
    const { clock, deps, save, hours } = setup();
    await save(weekdays);
    clock.now = NOW + 30 * DAY;

    await rollOpenHours(deps);
    const rolled = hours();
    await rollOpenHours(deps);
    expect(hours()).toEqual(rolled);

    await save(weekdays);
    expect(hours()).toEqual(rolled);
  });

  test("a calendar with no hours in its pattern is left alone", async () => {
    const { deps, state, hours } = setup();
    const elsewhere = [{ start: NOW, end: NOW + DAY }];
    state.openHours.set("cal1", elsewhere);
    expect(await rollOpenHours(deps)).toEqual({ rolled: [], failed: [] });
    expect(hours()).toEqual(elsewhere);
  });

  test("a refused write is reported and the old hours stand", async () => {
    const { deps, state, save, hours } = setup();
    await save(weekdays);
    const before = hours();
    state.rulesFail = true;
    const report = await rollOpenHours(deps);
    expect(report.rolled).toEqual([]);
    expect(report.failed.map((f) => f.id)).toEqual(["cal1"]);
    expect(hours()).toEqual(before);
  });

  test("a save during a roll wins: closed hours never come back as open", async () => {
    const { deps, state, save, hours, registry } = setup();
    await save(weekdays);
    // The roll's write is slow and the owner's save is fast. Unqueued, the roll lands last and writes
    // the old pattern's Tuesday to Friday back over the save that closed them.
    state.rulesLatencyMs.push(50, 0);
    const rolling = rollOpenHours(deps);
    await Bun.sleep(5);
    await save(mornings);
    await rolling;
    const afterRace = hours();

    expect(registry.get("cal1")?.week).toEqual(mornings);
    await save(mornings); // what the stored pattern alone writes
    expect(afterRace).toEqual(hours());
    expect(openOn(afterRace, NOW + 3 * DAY, NOW + 7 * DAY)).toBe(false); // Tuesday to Friday stay closed
  });
});

describe("today is the calendar's today", () => {
  test("at 03:00 UTC a Los Angeles calendar is still on the day before", () => {
    const at = Date.UTC(2036, 0, 6, 3);
    expect(dateRangeInZone(at, "America/Los_Angeles", 60)).toEqual({ fromDate: "2036-01-05", toDate: "2036-03-05" });
    expect(dateRangeInZone(at, "Europe/Berlin", 60)).toEqual({ fromDate: "2036-01-06", toDate: "2036-03-06" });
  });
});
