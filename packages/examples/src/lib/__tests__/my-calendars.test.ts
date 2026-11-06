import { describe, expect, spyOn, test } from "bun:test";
import { DEFAULT_WEEK, MAX_CALENDARS_PER_OWNER } from "../my-calendars";
import { BEN, OWNER } from "./meeting-fixtures";
import { BOOKING_BASE, STRANGER, setupPasses as setup } from "./pass-fixtures";

/** Unwraps an Outcome a test expects to succeed, failing with its message otherwise. */
function must<T>(outcome: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!outcome.ok) throw new Error(`expected ok, got: ${outcome.error}`);
  return outcome.value;
}

const consultations = { name: "Consultations", timezone: "Europe/Berlin" };

describe("creating a calendar", () => {
  test("belongs to the caller, gets weekday hours by default, books directly, and has a booking link", async () => {
    const { calendars, registry, state } = setup();
    const made = must(await calendars.create(OWNER, consultations));
    expect(made).toEqual({
      id: made.id,
      name: "Consultations",
      timezone: "Europe/Berlin",
      slotMinutes: 30,
      takesMeetingRequests: false,
      capacity: 1,
      bufferMinutes: 0,
      display: "appointments",
      bookingLink: `${BOOKING_BASE}/b/${made.id}`,
      week: DEFAULT_WEEK,
      createdAt: made.createdAt,
    });
    expect(registry.authorizeOwner(made.id, OWNER)?.week).toEqual(DEFAULT_WEEK);
    expect(registry.authorizeOwner(made.id, BEN)).toBeUndefined();
    expect((state.openHours.get(made.id) ?? []).length).toBeGreaterThan(30); // 60 days of weekdays, written as rules
  });

  test("capacity and turnover time reach the kernel, and the list reads them back from it", async () => {
    const { calendars, state } = setup();
    const made = must(await calendars.create(OWNER, { ...consultations, name: "Spin class", capacity: 12, bufferMinutes: 15, slotMinutes: 60 }));
    expect(state.resources.get(made.id)).toMatchObject({ capacity: 12, bufferAfter: 15 * 60_000 });
    const listed = must(await calendars.list(OWNER)).find((c) => c.id === made.id);
    expect(listed).toMatchObject({ capacity: 12, bufferMinutes: 15, slotMinutes: 60 });
  });

  test("a calendar that takes meeting requests is created in that mode", async () => {
    const { calendars, registry } = setup();
    const made = must(await calendars.create(OWNER, { ...consultations, takesMeetingRequests: true }));
    expect(made.takesMeetingRequests).toBe(true);
    expect(registry.get(made.id)?.bookingMode).toBe("request");
  });

  test("refuses bad input before anything is written", async () => {
    const { calendars, state, registry } = setup();
    const before = { resources: state.resources.size, owned: registry.listOwned(OWNER).length };
    for (const bad of [
      { timezone: "Mars/Olympus_Mons" },
      { timezone: "" },
      { name: "   " },
      { slotMinutes: 45 },
      { capacity: 0 },
      { capacity: 501 },
      { capacity: 1.5 },
      { bufferMinutes: -1 },
      { bufferMinutes: 241 },
      { week: {} },
      { week: { 1: [{ start: "9:00", end: "17:00" }] } },
    ]) {
      expect((await calendars.create(OWNER, { ...consultations, ...bad })).ok).toBe(false);
    }
    expect(state.resources.size).toBe(before.resources);
    expect(registry.listOwned(OWNER)).toHaveLength(before.owned);
  });

  test("a name is cleaned like every other public text", async () => {
    const { calendars } = setup();
    expect(must(await calendars.create(OWNER, { ...consultations, name: "Con\u0000sult‮ations" })).name).toBe("Con sult ations");
  });

  test("if the hours cannot be written, the half-made calendar is removed again", async () => {
    const { calendars, state, registry } = setup();
    const before = state.resources.size;
    state.rulesFail = true;
    expect((await calendars.create(OWNER, consultations)).ok).toBe(false);
    expect(state.resources.size).toBe(before);
    expect(registry.listOwned(OWNER).map((r) => r.name)).toEqual(["Simon's week"]);
  });

  test("if the hours fail and the kernel cannot even delete the resource, the caller's 'nothing was created' is still true", async () => {
    const { calendars, state, registry, dt } = setup();
    state.rulesFail = true;
    (dt.resources as unknown as { delete: () => Promise<void> }).delete = async () => {
      throw new Error("read ECONNRESET");
    };
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await calendars.create(OWNER, { ...consultations, name: "Ghost" })).ok).toBe(false);
      // The registry entry is gone: not listed, not counted against the cap, no page that reads as full.
      expect(registry.listOwned(OWNER).map((r) => r.name)).toEqual(["Simon's week"]);
      expect(must(await calendars.list(OWNER)).map((c) => c.name)).toEqual(["Simon's week"]);
      // The kernel resource it could not delete is named in the log, so an operator can remove it.
      const orphan = [...state.resources.values()].find((r) => r.name === "Ghost");
      expect(orphan).toBeDefined();
      expect(logged.mock.calls.some((args) => args.some((a) => String(a).includes(orphan?.id ?? "?")))).toBe(true);
    } finally {
      logged.mockRestore();
    }
  });

  test("a calendar that takes requests, and its view, are right from the record's first write", async () => {
    const { calendars, registry, dt } = setup();
    const rules = dt.rules as unknown as { replaceOpenHours: (id: string, s: unknown[]) => Promise<void> };
    const real = rules.replaceOpenHours.bind(rules);
    const seen: { mode?: string; display?: string } = {};
    rules.replaceOpenHours = async (id, segments) => {
      // While the hours are written, the calendar is already registered: it must not read as instant.
      seen.mode = registry.get(id)?.bookingMode;
      seen.display = registry.get(id)?.display;
      await real(id, segments);
    };
    must(await calendars.create(OWNER, { ...consultations, takesMeetingRequests: true }));
    expect(seen).toEqual({ mode: "request", display: "appointments" });
  });

  test(`one account owns at most ${MAX_CALENDARS_PER_OWNER} calendars, even when asked for at once`, async () => {
    const { calendars, registry } = setup();
    const tries = await Promise.all(
      Array.from({ length: MAX_CALENDARS_PER_OWNER + 5 }, (_, i) => calendars.create(STRANGER, { ...consultations, name: `Room ${i}` }))
    );
    expect(tries.filter((t) => t.ok)).toHaveLength(MAX_CALENDARS_PER_OWNER);
    expect(registry.listOwned(STRANGER)).toHaveLength(MAX_CALENDARS_PER_OWNER);
    expect((await calendars.create(STRANGER, consultations)).ok).toBe(false);
  });
});

describe("listing calendars", () => {
  test("an owner sees only their own calendars, so a stranger gets nothing", async () => {
    const { calendars } = setup();
    expect(must(await calendars.list(OWNER))).toEqual([
      {
        id: "cal1",
        name: "Simon's week",
        timezone: "Europe/Berlin",
        slotMinutes: 30,
        takesMeetingRequests: true,
        capacity: 1,
        bufferMinutes: 0,
        display: "appointments",
        bookingLink: `${BOOKING_BASE}/b/cal1`,
        week: {},
        createdAt: expect.any(Number),
      },
    ]);
    expect(must(await calendars.list(BEN)).map((c) => c.id)).toEqual(["cal2"]);
    expect(must(await calendars.list(STRANGER))).toEqual([]);
  });
});
