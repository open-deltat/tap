/**
 * Live-server suite for Events.watch: what a watcher is told, against a real deltat.
 *
 * The unit tests pin the tracker's logic on hand-built events. These pin the assumptions it rests
 * on, which only the kernel can confirm: that a commit sends its release and booking back to back,
 * that the reaper announces an expiry, and that the snapshot covers what existed before watching.
 *
 * Gated on DELTAT_INTEGRATION_PORT like the contract suite; every test skips without it.
 * Run locally:  DELTAT_INTEGRATION_PORT=5433 DELTAT_INTEGRATION_PASSWORD=... bun test packages/client/integration/
 */
import { afterAll, describe, expect, test } from "bun:test";
import { ulid } from "ulid";
import { DeltaT, type Change } from "../src/index.js";

const PORT_ENV = process.env.DELTAT_INTEGRATION_PORT;
const enabled = PORT_ENV !== undefined && PORT_ENV !== "";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const T0 = 2_100_000_000_000;
const HOLD_TTL = 300_000;
// The reaper ticks every 5 s (deltat src/reaper.rs), so an expiry is announced within one tick.
const REAPER_TICK = 5_000;

const dt = enabled
  ? new DeltaT({
      host: process.env.DELTAT_INTEGRATION_HOST ?? "127.0.0.1",
      port: Number(PORT_ENV),
      database: `it_${ulid()}`,
      password: process.env.DELTAT_INTEGRATION_PASSWORD ?? "deltat",
    })
  : null;

function client(): DeltaT {
  if (dt === null) throw new Error("integration client used while the suite is disabled");
  return dt;
}

afterAll(async () => {
  await dt?.close();
});

async function openCalendar(): Promise<string> {
  const c = client();
  const r = await c.resources.create({ name: `watch-${ulid()}`, capacity: 1 });
  await c.rules.create([{ resourceId: r.id, start: T0 - DAY, end: T0 + 2 * DAY }]);
  return r.id;
}

/** Watch a calendar and collect what it reports, with a way to wait for a given number of changes. */
async function watching(calendarId: string, window?: { start: number; end: number }) {
  const seen: Change[] = [];
  const stop = await client().events.watch(calendarId, (c) => seen.push(c), window ? { window } : undefined);
  const until = async (count: number, timeoutMs = 3_000) => {
    const deadline = Date.now() + timeoutMs;
    while (seen.length < count && Date.now() < deadline) await Bun.sleep(25);
    // Give anything extra (a wrongly reported release, say) the same chance to arrive.
    await Bun.sleep(300);
    return seen.map((c) => c.kind);
  };
  return { seen, stop, until };
}

const liveTest = enabled ? test : test.skip;

describe("Events.watch against a live deltat", () => {
  liveTest("a commit is reported as a hold and then a booking, with no freed time in between", async () => {
    const c = client();
    const cal = await openCalendar();
    const w = await watching(cal);
    const hold = await c.holds.place({ resourceId: cal, start: T0, end: T0 + HOUR, expiresAt: Date.now() + HOLD_TTL });
    await c.holds.commit(hold.id);
    expect(await w.until(2)).toEqual(["held", "booked"]);
    await w.stop();
  });

  liveTest("a release says which time it freed", async () => {
    const c = client();
    const cal = await openCalendar();
    const w = await watching(cal);
    const hold = await c.holds.place({ resourceId: cal, start: T0, end: T0 + HOUR, expiresAt: Date.now() + HOLD_TTL });
    await c.holds.release(hold.id);
    expect(await w.until(2)).toEqual(["held", "hold_ended"]);
    expect(w.seen[1]).toMatchObject({ kind: "hold_ended", holdId: hold.id, start: T0, end: T0 + HOUR });
    await w.stop();
  });

  liveTest(
    "a hold that expires on its own is announced, with its time",
    async () => {
      const c = client();
      const cal = await openCalendar();
      const w = await watching(cal);
      const hold = await c.holds.place({ resourceId: cal, start: T0, end: T0 + HOUR, expiresAt: Date.now() + 1_000 });
      expect(await w.until(2, 1_000 + 2 * REAPER_TICK)).toEqual(["held", "hold_ended"]);
      expect(w.seen[1]).toMatchObject({ holdId: hold.id, start: T0, end: T0 + HOUR });
      await w.stop();
    },
    20_000
  );

  liveTest("a booking made before watching still says when it was once cancelled", async () => {
    const c = client();
    const cal = await openCalendar();
    const hold = await c.holds.place({ resourceId: cal, start: T0, end: T0 + HOUR, expiresAt: Date.now() + HOLD_TTL });
    const { bookingId } = await c.holds.commit(hold.id);
    const w = await watching(cal);
    await c.bookings.cancel(bookingId);
    expect(await w.until(1)).toEqual(["cancelled"]);
    expect(w.seen[0]).toMatchObject({ bookingId, start: T0, end: T0 + HOUR });
    await w.stop();
  });

  liveTest("a window keeps changes to other times out", async () => {
    const c = client();
    const cal = await openCalendar();
    const w = await watching(cal, { start: T0, end: T0 + HOUR });
    await c.holds.place({ resourceId: cal, start: T0 + 5 * HOUR, end: T0 + 6 * HOUR, expiresAt: Date.now() + HOLD_TTL });
    await c.holds.place({ resourceId: cal, start: T0, end: T0 + HOUR, expiresAt: Date.now() + HOLD_TTL });
    expect(await w.until(1)).toEqual(["held"]);
    expect(w.seen[0]).toMatchObject({ start: T0 });
    await w.stop();
  });

  liveTest("resources.find tells an unknown calendar from an empty one", async () => {
    const c = client();
    const cal = await openCalendar();
    expect((await c.resources.find(cal))?.id).toBe(cal);
    expect(await c.resources.find("01ZZZZZZZZZZZZZZZZZZZZZZZZ")).toBeNull();
    // The trap find() exists for: the unknown id reads as an empty calendar, not as an error.
    expect(await c.bookings.get("01ZZZZZZZZZZZZZZZZZZZZZZZZ")).toEqual([]);
  });

  liveTest("stopping ends the stream", async () => {
    const c = client();
    const cal = await openCalendar();
    const w = await watching(cal);
    await w.stop();
    await c.holds.place({ resourceId: cal, start: T0, end: T0 + HOUR, expiresAt: Date.now() + HOLD_TTL });
    expect(await w.until(1, 500)).toEqual([]);
  });
});
