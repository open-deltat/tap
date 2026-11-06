import { describe, expect, test } from "bun:test";
import { BEN, MIN, NOW, OWNER, T } from "./meeting-fixtures";
import { GUEST, STRANGER, setupPasses as setup } from "./pass-fixtures";

/** Unwraps an Outcome a test expects to succeed, failing with its message otherwise. */
function must<T>(outcome: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!outcome.ok) throw new Error(`expected ok, got: ${outcome.error}`);
  return outcome.value;
}

const NOT_YOURS = { ok: false, error: "You do not own this calendar." };
const consultations = { name: "Consultations", timezone: "Europe/Berlin" };
const nineToFive = { 1: [{ start: "09:00", end: "17:00" }] };

describe("reading back a calendar's setup", () => {
  test("the list shows hours, slot length, places, turnover, mode, view and when it was made", async () => {
    const { calendars } = setup();
    const made = must(await calendars.create(OWNER, { ...consultations, week: nineToFive, slotMinutes: 60, capacity: 3, bufferMinutes: 10, takesMeetingRequests: true }));
    const listed = must(await calendars.list(OWNER)).find((c) => c.id === made.id);
    expect(listed).toMatchObject({
      week: nineToFive,
      slotMinutes: 60,
      capacity: 3,
      bufferMinutes: 10,
      takesMeetingRequests: true,
      display: "appointments",
    });
    expect(typeof listed?.createdAt).toBe("number");
  });
});

describe("checking hours and time zones, at create and at update", () => {
  const cases: [string, Record<string, unknown>, string][] = [
    [
      "overlapping blocks",
      { week: { 2: [{ start: "09:00", end: "12:00" }, { start: "11:00", end: "14:00" }] } },
      "Two blocks overlap on Tuesday: 09:00-12:00 and 11:00-14:00.",
    ],
    ["a slot longer than every block", { week: { 1: [{ start: "09:00", end: "10:00" }] }, slotMinutes: 90 }, "No block is long enough for a 90-minute slot."],
    ["a reversed block", { week: { 1: [{ start: "17:00", end: "09:00" }] } }, "Each block needs from before to, as HH:MM, e.g. 09:00 to 17:00."],
    ["an unreadable block", { week: { 1: [{ start: "9am", end: "5pm" }] } }, "Each block needs from before to, as HH:MM, e.g. 09:00 to 17:00."],
  ];
  for (const [what, input, message] of cases) {
    test(`refuses ${what}, with a plain reason`, async () => {
      const { calendars, state } = setup();
      const before = state.resources.size;
      expect(await calendars.create(OWNER, { ...consultations, ...input })).toEqual({ ok: false, error: message });
      expect(state.resources.size).toBe(before);
      const made = must(await calendars.create(OWNER, consultations));
      expect(await calendars.update(OWNER, made.id, input)).toEqual({ ok: false, error: message });
    });
  }

  test("accepts place-based zones and UTC; refuses legacy abbreviations", async () => {
    const { calendars } = setup();
    for (const zone of ["Europe/Berlin", "America/Argentina/Buenos_Aires", "UTC"]) {
      expect((await calendars.create(OWNER, { ...consultations, timezone: zone })).ok).toBe(true);
    }
    for (const zone of ["CET", "EST", "US/Eastern", "Etc/GMT+1", "Mars/Olympus_Mons"]) {
      expect(await calendars.create(OWNER, { ...consultations, timezone: zone })).toEqual({
        ok: false,
        error: "Use a place-based zone such as Europe/Berlin.",
      });
    }
  });
});

describe("updating a calendar", () => {
  test("the owner changes name, hours, slot, places, turnover and mode; the kernel and the record follow", async () => {
    const { calendars, state, registry } = setup();
    const made = must(await calendars.create(OWNER, consultations));
    const updated = must(
      await calendars.update(OWNER, made.id, {
        name: "Advice",
        week: { 3: [{ start: "10:00", end: "14:00" }] },
        slotMinutes: 60,
        capacity: 4,
        bufferMinutes: 15,
        takesMeetingRequests: true,
      })
    );
    expect(updated).toMatchObject({ name: "Advice", slotMinutes: 60, capacity: 4, bufferMinutes: 15, takesMeetingRequests: true, week: { 3: [{ start: "10:00", end: "14:00" }] } });
    expect(state.resources.get(made.id)).toMatchObject({ name: "Advice", capacity: 4, bufferAfter: 15 * 60_000 });
    expect(registry.get(made.id)?.bookingMode).toBe("request");
  });

  test("a stranger cannot update it, and a missing calendar reads the same; nothing changes", async () => {
    const { calendars, state } = setup();
    const made = must(await calendars.create(OWNER, consultations));
    expect(await calendars.update(STRANGER, made.id, { name: "Mine now", capacity: 9 })).toEqual(NOT_YOURS);
    expect(await calendars.update(OWNER, "nope", { name: "x" })).toEqual(NOT_YOURS);
    expect(state.resources.get(made.id)).toMatchObject({ name: "Consultations", capacity: 1 });
  });

  test("with future bookings, fewer places or more turnover is refused (they might no longer fit); more places and new hours are fine", async () => {
    const { calendars, state } = setup();
    const made = must(await calendars.create(OWNER, { ...consultations, capacity: 3, bufferMinutes: 10 }));
    state.seededBookings.push({ id: "b1", resourceId: made.id, start: T, end: T + 30 * MIN });
    const refused = await calendars.update(OWNER, made.id, { capacity: 2 });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toContain("1 future booking");
    expect((await calendars.update(OWNER, made.id, { bufferMinutes: 20 })).ok).toBe(false);
    expect(state.resources.get(made.id)).toMatchObject({ capacity: 3, bufferAfter: 10 * 60_000 });

    must(await calendars.update(OWNER, made.id, { capacity: 5, bufferMinutes: 5, week: { 6: [{ start: "10:00", end: "12:00" }] } }));
    expect(state.seededBookings).toHaveLength(1); // the booking stands
  });
});

describe("deleting a calendar", () => {
  test("the owner deletes it: gone from the list and from deltat, and its live passes are revoked", async () => {
    const { calendars, passes, state, registry } = setup();
    const made = must(await calendars.create(OWNER, consultations));
    const pass = passes.create({ owner: OWNER, calendarId: made.id, from: T, to: T + 120 * MIN });
    if (!pass.ok) throw new Error(pass.error);
    must(await calendars.delete(OWNER, made.id));
    expect(registry.get(made.id)).toBeUndefined();
    expect(state.resources.has(made.id)).toBe(false);
    expect(must(await calendars.list(OWNER)).map((c) => c.id)).not.toContain(made.id);
    expect(await passes.findTimes({ token: pass.value.token, caller: GUEST })).toMatchObject({ ok: false });
  });

  test("refused while it has future bookings, saying how many; past bookings do not count", async () => {
    const { calendars, state, registry } = setup();
    const made = must(await calendars.create(OWNER, consultations));
    state.seededBookings.push(
      { id: "past", resourceId: made.id, start: NOW - 120 * MIN, end: NOW - 90 * MIN },
      { id: "f1", resourceId: made.id, start: T, end: T + 30 * MIN },
      { id: "f2", resourceId: made.id, start: T + 60 * MIN, end: T + 90 * MIN }
    );
    const refused = await calendars.delete(OWNER, made.id);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toContain("2 future bookings");
    expect(registry.get(made.id)).toBeDefined();
  });

  test("a stranger cannot delete it, and a missing calendar reads the same", async () => {
    const { calendars, registry } = setup();
    const made = must(await calendars.create(OWNER, consultations));
    expect(await calendars.delete(STRANGER, made.id)).toEqual(NOT_YOURS);
    expect(await calendars.delete(BEN, "nope")).toEqual(NOT_YOURS);
    expect(registry.get(made.id)).toBeDefined();
  });

  test("if deltat cannot delete it, the caller is told so and the calendar is still there", async () => {
    const { calendars, state, registry } = setup();
    const made = must(await calendars.create(OWNER, consultations));
    state.deleteFails = true;
    const failed = await calendars.delete(OWNER, made.id);
    expect(failed.ok).toBe(false);
    expect(registry.get(made.id)).toBeDefined();
    expect(must(await calendars.list(OWNER)).map((c) => c.id)).toContain(made.id);
  });

  test("deleting frees a place under the cap", async () => {
    const { calendars, registry } = setup();
    const made = must(await calendars.create(STRANGER, consultations));
    expect(registry.listOwned(STRANGER)).toHaveLength(1);
    must(await calendars.delete(STRANGER, made.id));
    expect(registry.listOwned(STRANGER)).toHaveLength(0);
  });
});
