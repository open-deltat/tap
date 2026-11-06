/**
 * Live-server suite for public calendars against a real deltat: creating one through the one create
 * path (`lib/my-calendars`, what the hosted MCP's create_calendar runs), then booking it through
 * `lib/bookable-service`, and the manage links of bookables the retired anonymous form made.
 *
 * The unit tests cover the pure layers (keys, registry, sanitizing, rate limits). Everything those
 * cannot reach is here: that a weekly schedule becomes real rules, that availability slices into
 * bookable slots, that a second hold on a held span loses, and that a commit removes the slot.
 *
 * It drives the same functions the server actions call rather than re-implementing their steps, so
 * the suite cannot quietly drift away from what the site actually does. The actions themselves are
 * a thin rate-limiting shell over these, and `next/headers` keeps them out of a plain test process.
 *
 * Gated on DELTAT_INTEGRATION_PORT; without it every test skips so the plain `bun test` unit run
 * stays server-free.
 *
 * Run locally:
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
import {
  commitHold,
  deleteBookable,
  holdSlot,
  listBookings,
  listSlots,
  releaseHold,
  renameBookable,
  type BookableDeps,
} from "../src/lib/bookable-service";
import { createMyCalendars } from "../src/lib/my-calendars";
import type { WeekHours } from "../src/examples/builder/schedule";

const PORT_ENV = process.env.DELTAT_INTEGRATION_PORT;
const enabled = PORT_ENV !== undefined && PORT_ENV !== "";

const DAY_MS = 86_400_000;

// A fresh tenant per run (database = tenant in deltat) and a throwaway registry file, so a run
// never sees another run's bookables.
const scratchDir = enabled ? mkdtempSync(join(tmpdir(), "tap-public-it-")) : "";

const deps: BookableDeps | null = enabled
  ? {
      dt: new DeltaT({
        host: process.env.DELTAT_INTEGRATION_HOST ?? "127.0.0.1",
        port: Number(PORT_ENV),
        // deltat strips non-alphanumerics when it sanitizes a tenant name, so the dashes go.
        database: `pub${randomUUID().replace(/-/g, "")}`,
        password: process.env.DELTAT_INTEGRATION_PASSWORD ?? "deltat",
      }),
      registry: openBookableRegistry(join(scratchDir, "registry.json")),
    }
  : null;

function d(): BookableDeps {
  if (deps === null) throw new Error("integration deps used while the suite is disabled");
  return deps;
}

/** Weekdays 09:00 to 17:00, the shape the create form's default produces. */
const WEEKDAYS_9_TO_5: WeekHours = {
  0: [],
  1: [{ start: "09:00", end: "17:00" }],
  2: [{ start: "09:00", end: "17:00" }],
  3: [{ start: "09:00", end: "17:00" }],
  4: [{ start: "09:00", end: "17:00" }],
  5: [{ start: "09:00", end: "17:00" }],
  6: [],
};

const OWNER = "https://issuer.test#owner";

/** The one create path: what the hosted MCP's create_calendar runs. */
const calendars = () => createMyCalendars({ ...d(), bookingBase: null });

async function makeBookable(name = "Dentist chair", slotMinutes = 30) {
  const created = await calendars().create(OWNER, { name, slotMinutes, timezone: "Europe/Berlin", week: WEEKDAYS_9_TO_5 });
  if (!created.ok) throw new Error(`setup failed to create a calendar: ${created.error}`);
  return created.value;
}

/**
 * A bookable as the retired anonymous form made it: a resource registered with a manage key and no
 * owner. Records like this still exist on the live site, and their manage links must keep working.
 */
async function legacyBookable(name: string) {
  const resource = await d().dt.resources.create({ name });
  const { manageKey } = d().registry.register({ id: resource.id, name, slotMinutes: 30, timezone: "Europe/Berlin" });
  return { id: resource.id, manageKey };
}

/**
 * The first whole slot that is still ahead of us.
 *
 * Today's open hours have usually already passed, and availability correctly returns nothing for
 * them, so a naive "first open day" makes this suite fail every afternoon.
 */
async function firstFutureSlot(id: string, slotMinutes: number) {
  const slotMs = slotMinutes * 60_000;
  const now = Date.now();
  for (let dayOffset = 0; dayOffset < 10; dayOffset++) {
    const dayStart = new Date(now + dayOffset * DAY_MS).setHours(0, 0, 0, 0);
    const spans = await listSlots(d(), id, dayStart, dayStart + DAY_MS);
    for (const span of spans) {
      for (let start = span.start; start + slotMs <= span.end; start += slotMs) {
        if (start > now) return { start, end: start + slotMs, dayStart };
      }
    }
  }
  throw new Error("no future slot inside 10 days of open hours");
}

afterAll(async () => {
  if (deps === null) return;
  await deps.dt.close();
  rmSync(scratchDir, { recursive: true, force: true });
});

if (!enabled) {
  console.log("integration: DELTAT_INTEGRATION_PORT not set; skipping the public-bookables suite");
}

describe.skipIf(!enabled)("creating a bookable", () => {
  test("a weekly schedule becomes concrete rules across the horizon", async () => {
    const { id } = await makeBookable();
    const rules = await d().dt.rules.get(id);
    // 60 days of weekdays is roughly 43 blocks. Pinning a floor rather than an exact count keeps
    // this from failing purely because the run started on a different weekday.
    expect(rules.length).toBeGreaterThan(35);
    expect(rules.every((r) => !r.blocking)).toBe(true);
  });

  test("availability slices into whole bookable slots", async () => {
    const { id } = await makeBookable("Slot shape", 30);
    const { dayStart } = await firstFutureSlot(id, 30);
    const spans = await listSlots(d(), id, dayStart, dayStart + DAY_MS);
    const total = spans.reduce((sum, s) => sum + (s.end - s.start), 0);
    // A full open day is eight hours, which is sixteen 30-minute slots.
    expect(total).toBe(8 * 3_600_000);
  });

  test("the name reaches deltat, not just the registry", async () => {
    const { id, name } = await makeBookable("Named in both places");
    const resources = await d().dt.resources.get();
    expect(resources.find((r) => r.id === id)?.name).toBe(name);
  });

  test("a rejected input creates nothing", async () => {
    const before = (await d().dt.resources.get()).length;
    const result = await calendars().create(OWNER, { name: "   ", slotMinutes: 30, timezone: "Europe/Berlin", week: WEEKDAYS_9_TO_5 });
    expect(result.ok).toBe(false);
    expect((await d().dt.resources.get()).length).toBe(before);
  });

  test("an unknown time zone is refused before anything is written", async () => {
    const before = (await d().dt.resources.get()).length;
    const result = await calendars().create(OWNER, { name: "Bad zone", slotMinutes: 30, timezone: "Mars/Olympus_Mons", week: WEEKDAYS_9_TO_5 });
    expect(result.ok).toBe(false);
    expect((await d().dt.resources.get()).length).toBe(before);
  });

  test("capacity and turnover reach deltat, and two places at the same time can both be booked", async () => {
    const created = await calendars().create(OWNER, { name: "Two chairs", slotMinutes: 30, timezone: "Europe/Berlin", week: WEEKDAYS_9_TO_5, capacity: 2, bufferMinutes: 15 });
    if (!created.ok) throw new Error(created.error);
    const { id } = created.value;
    expect(await d().dt.resources.find(id)).toMatchObject({ capacity: 2, bufferAfter: 15 * 60_000 });

    const slot = await firstFutureSlot(id, 30);
    expect((await holdSlot(d(), id, slot.start, slot.end)).ok).toBe(true);
    expect((await holdSlot(d(), id, slot.start, slot.end)).ok).toBe(true);
    expect((await holdSlot(d(), id, slot.start, slot.end)).ok).toBe(false); // the third place does not exist
  });
});

describe.skipIf(!enabled)("holding and booking", () => {
  test("a second hold on a held span is refused", async () => {
    // The invariant the whole product rests on, exercised through the same path the site uses.
    const { id } = await makeBookable("Race target");
    const slot = await firstFutureSlot(id, 30);

    const first = await holdSlot(d(), id, slot.start, slot.end);
    expect(first.ok).toBe(true);

    const second = await holdSlot(d(), id, slot.start, slot.end);
    expect(second.ok).toBe(false);
  });

  test("a released hold frees the span again", async () => {
    const { id } = await makeBookable("Release path");
    const slot = await firstFutureSlot(id, 30);

    const held = await holdSlot(d(), id, slot.start, slot.end);
    if (!held.ok) throw new Error(held.error);
    await releaseHold(d(), id, held.value.holdId);

    const again = await holdSlot(d(), id, slot.start, slot.end);
    expect(again.ok).toBe(true);
  });

  test("committing a hold books the slot and takes it out of availability", async () => {
    const { id } = await makeBookable("Commit path");
    const slot = await firstFutureSlot(id, 30);

    const held = await holdSlot(d(), id, slot.start, slot.end);
    if (!held.ok) throw new Error(held.error);

    const committed = await commitHold(d(), id, held.value.holdId, "Simon");
    expect(committed.ok).toBe(true);

    const after = await listSlots(d(), id, slot.dayStart, slot.dayStart + DAY_MS);
    expect(after.some((s) => s.start <= slot.start && s.end >= slot.end)).toBe(false);

    const booked = await d().dt.bookings.get(id, { start: slot.dayStart, end: slot.dayStart + DAY_MS });
    expect(booked).toHaveLength(1);
    expect(booked[0].label).toBe("Simon");
  });

  test("the booker's name is sanitized on its way into the WAL", async () => {
    // GAP-02: label is free text in the kernel, so this is the one stranger-supplied string that
    // reaches the log. A newline in it must not survive as a newline.
    const { id } = await makeBookable("Sanitized label");
    const slot = await firstFutureSlot(id, 30);

    const held = await holdSlot(d(), id, slot.start, slot.end);
    if (!held.ok) throw new Error(held.error);
    expect((await commitHold(d(), id, held.value.holdId, "Line\nBreak")).ok).toBe(true);

    const booked = await d().dt.bookings.get(id, { start: slot.dayStart, end: slot.dayStart + DAY_MS });
    expect(booked[0].label).toBe("Line Break");
  });

  test("an empty booker name is refused and the hold survives for a retry", async () => {
    const { id } = await makeBookable("Nameless");
    const slot = await firstFutureSlot(id, 30);

    const held = await holdSlot(d(), id, slot.start, slot.end);
    if (!held.ok) throw new Error(held.error);

    expect((await commitHold(d(), id, held.value.holdId, "   ")).ok).toBe(false);
    expect((await commitHold(d(), id, held.value.holdId, "Second try")).ok).toBe(true);
  });
});

describe.skipIf(!enabled)("ownership over the wire, for bookables the old anonymous form made", () => {
  test("their manage link still reads their bookings", async () => {
    const { id, manageKey } = await legacyBookable("Old form");
    const window = { start: Date.now(), end: Date.now() + DAY_MS };
    expect(await listBookings(d(), id, manageKey, window)).toEqual({ ok: true, value: [] });
    expect((await listBookings(d(), id, "not-the-key", window)).ok).toBe(false);
  });

  test("renaming with the key updates both the registry and deltat", async () => {
    const { id, manageKey } = await legacyBookable("Before");
    const renamed = await renameBookable(d(), id, manageKey, "After");
    expect(renamed.ok).toBe(true);

    const resources = await d().dt.resources.get();
    expect(resources.find((r) => r.id === id)?.name).toBe("After");
  });

  test("a wrong key changes nothing, in the registry or in deltat", async () => {
    const { id } = await legacyBookable("Untouchable");

    expect((await renameBookable(d(), id, "not-the-key", "Hijacked")).ok).toBe(false);
    expect((await deleteBookable(d(), id, "not-the-key")).ok).toBe(false);

    const resources = await d().dt.resources.get();
    expect(resources.find((r) => r.id === id)?.name).toBe("Untouchable");
  });

  test("one bookable's key does not open another over the wire", async () => {
    const mine = await legacyBookable("Mine");
    const theirs = await legacyBookable("Theirs");

    expect((await deleteBookable(d(), theirs.id, mine.manageKey)).ok).toBe(false);
    expect((await d().dt.resources.get()).some((r) => r.id === theirs.id)).toBe(true);
  });

  test("deleting removes the resource from deltat and the entry from the registry", async () => {
    const { id, manageKey } = await legacyBookable("Doomed");
    expect((await deleteBookable(d(), id, manageKey)).ok).toBe(true);

    expect((await d().dt.resources.get()).some((r) => r.id === id)).toBe(false);
    expect(d().registry.get(id)).toBeUndefined();
    // And the booking surface closes with it, rather than serving a resource nobody owns.
    expect(await listSlots(d(), id, Date.now(), Date.now() + DAY_MS)).toEqual([]);
  });

  test("an unregistered id is never served, even if it exists in the tenant", async () => {
    // Someone who learns a raw deltat id must not be able to drive the public surface with it.
    const orphan = await d().dt.resources.create({ name: "Not published" });
    expect(await listSlots(d(), orphan.id, Date.now(), Date.now() + DAY_MS)).toEqual([]);
    expect((await holdSlot(d(), orphan.id, Date.now() + DAY_MS, Date.now() + DAY_MS + 1_800_000)).ok).toBe(
      false
    );
    await d().dt.resources.delete(orphan.id);
  });
});
