import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { openBookableRegistry } from "../public-bookables";
import { DISPLAY_NAMES, DISPLAYS, checkDisplay } from "../calendar-displays";
import { BEN, OWNER, tmpPath } from "./meeting-fixtures";
import { STRANGER, setupPasses as setup } from "./pass-fixtures";

/** Unwraps an Outcome a test expects to succeed, failing with its message otherwise. */
function must<T>(outcome: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!outcome.ok) throw new Error(`expected ok, got: ${outcome.error}`);
  return outcome.value;
}

const consultations = { name: "Consultations", timezone: "Europe/Berlin" };

describe("a calendar's public view", () => {
  test("a new calendar shows as appointments unless it says otherwise", async () => {
    const { calendars } = setup();
    expect(must(await calendars.create(OWNER, consultations)).display).toBe("appointments");
    expect(must(await calendars.create(OWNER, { ...consultations, display: "appointments" })).display).toBe("appointments");
  });

  test("only views on the list are accepted, at create and at change", async () => {
    const { calendars, state } = setup();
    const before = state.resources.size;
    expect((await calendars.create(OWNER, { ...consultations, display: "hologram" })).ok).toBe(false);
    expect(state.resources.size).toBe(before);
    const made = must(await calendars.create(OWNER, consultations));
    expect((await calendars.setDisplay(OWNER, made.id, "hologram")).ok).toBe(false);
  });

  test("the owner can set the view; nobody else can, and a missing calendar reads the same", async () => {
    const { calendars, registry } = setup();
    const made = must(await calendars.create(OWNER, consultations));
    expect(must(await calendars.setDisplay(OWNER, made.id, "appointments")).display).toBe("appointments");
    const stranger = await calendars.setDisplay(STRANGER, made.id, "appointments");
    const missing = await calendars.setDisplay(OWNER, "nope", "appointments");
    expect(stranger).toEqual({ ok: false, error: "You do not own this calendar." });
    expect(missing).toEqual(stranger);
    expect(registry.get(made.id)?.display).toBe("appointments");
  });

  test("the list shows each calendar's view", async () => {
    const { calendars } = setup();
    expect(must(await calendars.list(OWNER)).map((c) => c.display)).toEqual(["appointments"]);
    expect(must(await calendars.list(BEN)).map((c) => c.display)).toEqual(["appointments"]);
  });

  test("every view on the list has its example, when to pick it, and fits every shape create_calendar can make", () => {
    for (const name of DISPLAY_NAMES) {
      expect(DISPLAYS[name].example).toBeTruthy();
      expect(DISPLAYS[name].pick.length).toBeGreaterThan(20);
    }
    for (const shape of [
      { capacity: 1, bufferMinutes: 0, takesMeetingRequests: false },
      { capacity: 12, bufferMinutes: 15, takesMeetingRequests: false },
      { capacity: 1, bufferMinutes: 0, takesMeetingRequests: true },
    ]) {
      expect(checkDisplay("appointments", shape)).toEqual({ ok: true, value: "appointments" });
    }
  });
});

describe("the stored view", () => {
  test("a record written before calendars had a view reads as appointments, and so does a view this version does not know", () => {
    // The live site reads this file: records written by older (and newer) versions must keep loading.
    const path = tmpPath(`display_compat_${crypto.randomUUID()}`);
    const old = { id: "old", name: "Old", slotMinutes: 30, timezone: "UTC", createdAt: 1, keyHash: "0".repeat(64), owner: "iss#alice" };
    const future = { ...old, id: "future", name: "Future", display: "hologram" };
    writeFileSync(path, JSON.stringify({ version: 1, records: [old, future] }));

    const registry = openBookableRegistry(path);
    expect(registry.get("old")?.display).toBe("appointments");
    expect(registry.get("future")?.display).toBe("appointments");
    expect(registry.count()).toBe(2);

    expect(registry.updateOwned("old", "iss#alice", { display: "appointments" })?.display).toBe("appointments");
    expect(openBookableRegistry(path).get("old")?.display).toBe("appointments");
  });
});
