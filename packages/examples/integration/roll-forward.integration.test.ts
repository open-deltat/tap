/**
 * Live-server suite for the open-hours roll-forward: `rollOpenHours` against a real deltat.
 *
 * The unit tests fake the kernel's rules. What only a real one can show: that a calendar saved 61
 * days ago really offers no slots, and that after the job it offers them again, with holds placeable.
 *
 * Gated on DELTAT_INTEGRATION_PORT like the other live suites. Run locally:
 *   DELTAT_INTEGRATION_PORT=5445 DELTAT_INTEGRATION_PASSWORD=verify \
 *     bun test packages/examples/integration/
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { DeltaT } from "@open-deltat/client";
import { openBookableRegistry } from "../src/lib/public-bookables";
import { createOwnedCalendar, rollOpenHours, saveAvailability } from "../src/lib/owned-calendar-service";
import { holdSlot, listSlots } from "../src/lib/bookable-service";

const PORT_ENV = process.env.DELTAT_INTEGRATION_PORT;
const enabled = PORT_ENV !== undefined && PORT_ENV !== "";
const liveTest = enabled ? test : test.skip;

const DAY = 86_400_000;
const OWNER = "https://issuer.test#owner";

const scratchDir = enabled ? mkdtempSync(join(tmpdir(), "tap-roll-it-")) : "";
const dt = enabled
  ? new DeltaT({
      host: process.env.DELTAT_INTEGRATION_HOST ?? "127.0.0.1",
      port: Number(PORT_ENV),
      database: `roll${randomUUID().replace(/-/g, "")}`,
      password: process.env.DELTAT_INTEGRATION_PASSWORD ?? "deltat",
    })
  : null;

afterAll(async () => {
  await dt?.close();
  if (scratchDir) rmSync(scratchDir, { recursive: true, force: true });
});

describe("the open-hours roll-forward against a live deltat", () => {
  liveTest("a calendar saved 61 days ago is bookable again after the job", async () => {
    if (!dt) throw new Error("live suite without a client");
    const registry = openBookableRegistry(join(scratchDir, `registry-${randomUUID()}.json`));
    const made = await createOwnedCalendar({ dt, registry }, { name: "Office hours", timezone: "UTC", owner: OWNER });
    if (!made.ok) throw new Error(made.error);
    const id = made.value.id;
    const day = [{ start: "09:00", end: "17:00" }];
    const week = { 0: day, 1: day, 2: day, 3: day, 4: day, 5: day, 6: day };
    const savedAt = Date.now() - 61 * DAY;
    const saved = await saveAvailability({ dt, registry, now: () => savedAt }, { id, owner: OWNER, week, slotMinutes: 30, priceCents: null });
    if (!saved.ok) throw new Error(saved.error);

    const from = Date.now() + DAY;
    const to = from + 2 * DAY;
    expect(await listSlots({ dt, registry }, id, from, to)).toEqual([]);

    const report = await rollOpenHours({ dt, registry, now: Date.now });
    expect(report).toEqual({ rolled: [id], failed: [] });

    const slots = await listSlots({ dt, registry }, id, from, to);
    expect(slots.length).toBeGreaterThan(0);
    const first = slots[0];
    if (!first) throw new Error("no slot after the roll");
    const held = await holdSlot({ dt, registry }, id, first.start, first.start + 30 * 60_000);
    expect(held.ok).toBe(true);
  });
});
