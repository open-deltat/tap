/**
 * Live-server contract suite: the SDK against a real deltat over the wire.
 *
 * Gated on DELTAT_INTEGRATION_PORT; without it every test skips so the plain `bun test` unit run
 * stays server-free. With it, the suite pins the cross-repo contracts the unit tests can only
 * assume: multi-row INSERT builders, IN-clause reads, client-side window filtering over
 * predicate-ignoring SELECTs, availability shapes, and quote escaping through the kernel's $N
 * substitution.
 *
 * Run locally:  DELTAT_INTEGRATION_PORT=5433 bun test packages/client/integration/
 *
 * Capabilities the running server may lack (e.g. the published 0.1.0 crate predates the
 * `UPDATE holds SET booking_id` commit surface) are probed once at startup; their tests skip
 * with a logged reason so the suite also passes against an older deltat.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { ulid } from "ulid";
import { DeltaT } from "../src/index.js";
import { MAX_IN_CLAUSE_IDS } from "../src/chunk.js";

const PORT_ENV = process.env.DELTAT_INTEGRATION_PORT;
const enabled = PORT_ENV !== undefined && PORT_ENV !== "";

// Far-future base so wall-clock "now" never intersects test spans; each test isolates itself with
// fresh resources, and the whole run isolates itself in a fresh tenant (database = tenant in deltat).
const DAY = 86_400_000;
const HOUR = 3_600_000;
const T0 = 2_100_000_000_000;
const HOLD_TTL = 300_000; // 5 min: under any server-side hold-TTL clamp, so expiresAt round-trips exactly

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

/** Fresh resource with open hours covering [T0, T0 + 2 days). */
async function openResource(opts?: { capacity?: number; name?: string }): Promise<string> {
  const c = client();
  const r = await c.resources.create({ name: opts?.name ?? `it-${ulid()}`, capacity: opts?.capacity ?? 1 });
  await c.rules.create([{ resourceId: r.id, start: T0 - DAY, end: T0 + 2 * DAY }]);
  return r.id;
}

type Probe = { supported: true } | { supported: false; reason: string };

/** holds.commit needs the CommitHold SQL surface (UPDATE holds SET booking_id), absent before 0.2. */
async function probeCommitHold(): Promise<Probe> {
  const c = client();
  const rid = await openResource({ name: "capability-probe" });
  const hold = await c.holds.place({
    resourceId: rid,
    start: T0,
    end: T0 + HOUR,
    expiresAt: Date.now() + HOLD_TTL,
  });
  try {
    await c.holds.commit(hold.id);
    return { supported: true };
  } catch (err) {
    return { supported: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    await c.resources.delete(rid);
  }
}

// Top-level await: probes run before test collection so skips register as real skips. A dead or
// wrong port fails here, failing the whole file, so the suite can never green against no server.
const commitHold: Probe = enabled
  ? await probeCommitHold()
  : { supported: false, reason: "suite disabled" };

if (!enabled) {
  console.log("integration: DELTAT_INTEGRATION_PORT not set; skipping the live-server contract suite");
} else if (!commitHold.supported) {
  console.log(`integration: server lacks holds.commit (${commitHold.reason}); skipping commit-flow tests`);
}

afterAll(async () => {
  if (dt !== null) await dt.close();
});

describe.skipIf(!enabled)("resources", () => {
  test("createMany inserts every row via the multi-row $N builder and reads agree with the echo", async () => {
    const c = client();
    const created = await c.resources.createMany([
      { name: `room-${ulid()}`, capacity: 2 },
      { name: "seat-a" },
      { name: "seat-b", bufferAfter: 600_000 },
    ]);

    // The SDK returns its client-side echo without a read; the server must agree byte-for-byte,
    // defaults included (capacity 1, parentId and bufferAfter null).
    const byId = new Map((await c.resources.get()).map((r) => [r.id, r]));
    for (const r of created) {
      expect(byId.get(r.id)).toEqual(r);
    }
  });

  test("parent filters: roots excludes children and parentId returns exactly them", async () => {
    const c = client();
    const parent = await c.resources.create({ name: `venue-${ulid()}` });
    const children = await c.resources.createMany([
      { parentId: parent.id, name: "row-1" },
      { parentId: parent.id, name: "row-2" },
    ]);

    const roots = await c.resources.get({ roots: true });
    expect(roots.some((r) => r.id === parent.id)).toBe(true);
    expect(roots.some((r) => r.id === children[0].id)).toBe(false);

    const kids = await c.resources.get({ parentId: parent.id });
    expect(kids.map((r) => r.id).sort()).toEqual(children.map((r) => r.id).sort());
  });

  test("update rewrites all fields via the dynamic $N SET builder", async () => {
    // All three fields on purpose: the published 0.1.0 kernel defaults unmentioned UPDATE columns
    // (capacity to 1), so partial-update semantics are pinned kernel-side, not here.
    const c = client();
    const r = await c.resources.create({ name: "before", capacity: 1 });
    await c.resources.update(r.id, { name: "after", capacity: 3, bufferAfter: 900_000 });

    const readBack = (await c.resources.get()).find((x) => x.id === r.id);
    expect(readBack).toEqual({ id: r.id, parentId: null, name: "after", capacity: 3, bufferAfter: 900_000 });
  });

  test("delete removes exactly the target resource", async () => {
    const c = client();
    const keep = await c.resources.create({ name: `keep-${ulid()}` });
    const drop = await c.resources.create({ name: `drop-${ulid()}` });
    await c.resources.delete(drop.id);

    const all = await c.resources.get();
    expect(all.some((r) => r.id === drop.id)).toBe(false);
    expect(all.some((r) => r.id === keep.id)).toBe(true);
  });

  test("names with single quotes survive the round-trip intact and touch no other rows", async () => {
    const c = client();
    const sentinel = await c.resources.create({ name: `sentinel-${ulid()}` });
    const hostileSingle = `O'Brien'); DELETE FROM resources; --`;
    const hostileBatch = `Ann''s "spot", DROP TABLE bookings; --`;

    // Both quoting paths: the tagged-template single INSERT and the hand-built multi-row $N INSERT.
    const single = await c.resources.create({ name: hostileSingle });
    const [batchA, batchB] = await c.resources.createMany([
      { name: hostileBatch },
      { name: "plain" },
    ]);

    const all = await c.resources.get();
    expect(all.find((r) => r.id === single.id)?.name).toBe(hostileSingle);
    expect(all.find((r) => r.id === batchA.id)?.name).toBe(hostileBatch);
    expect(all.find((r) => r.id === batchB.id)?.name).toBe("plain");
    expect(all.some((r) => r.id === sentinel.id)).toBe(true);
  });
});

describe.skipIf(!enabled)("rules", () => {
  test("multi-row create lands every rule with its blocking flag mapped to a real boolean", async () => {
    const c = client();
    const r = await c.resources.create({ name: `rules-${ulid()}` });
    const created = await c.rules.create([
      { resourceId: r.id, start: T0, end: T0 + 8 * HOUR },
      { resourceId: r.id, start: T0 + 2 * HOUR, end: T0 + 3 * HOUR, blocking: true },
      { resourceId: r.id, start: T0 + 10 * HOUR, end: T0 + 12 * HOUR },
    ]);

    const readBack = await c.rules.get(r.id);
    expect(readBack.length).toBe(3);
    const byId = new Map(readBack.map((rule) => [rule.id, rule]));
    for (const rule of created) {
      const got = byId.get(rule.id);
      expect(got).toEqual(rule);
      expect(typeof got?.blocking).toBe("boolean");
    }
  });

  test("update rewrites a rule's window and blocking flag", async () => {
    const c = client();
    const r = await c.resources.create({ name: `ruleupd-${ulid()}` });
    const [rule] = await c.rules.create([{ resourceId: r.id, start: T0, end: T0 + HOUR }]);
    await c.rules.update(rule.id, { start: T0 + HOUR, end: T0 + 2 * HOUR, blocking: true });

    const readBack = await c.rules.get(r.id);
    expect(readBack).toEqual([
      { id: rule.id, resourceId: r.id, start: T0 + HOUR, end: T0 + 2 * HOUR, blocking: true },
    ]);
  });

  test("delete removes a rule", async () => {
    const c = client();
    const r = await c.resources.create({ name: `ruledel-${ulid()}` });
    const [rule] = await c.rules.create([{ resourceId: r.id, start: T0, end: T0 + HOUR }]);
    await c.rules.delete(rule.id);
    expect(await c.rules.get(r.id)).toEqual([]);
  });
});

describe.skipIf(!enabled)("bookings", () => {
  test("batch create is all-or-nothing: one conflict rejects the whole batch", async () => {
    const c = client();
    const rid = await openResource();
    const [existing] = await c.bookings.create([{ resourceId: rid, start: T0, end: T0 + HOUR }]);

    // Second item collides with the existing booking; the first item alone would be fine.
    await expect(
      c.bookings.create([
        { resourceId: rid, start: T0 + HOUR, end: T0 + 2 * HOUR },
        { resourceId: rid, start: T0, end: T0 + 30 * 60_000 },
      ])
    ).rejects.toThrow();

    const after = await c.bookings.get(rid);
    expect(after.map((b) => b.id)).toEqual([existing.id]);
  });

  test("window reads filter client-side with half-open overlap against live rows", async () => {
    const c = client();
    const rid = await openResource();
    const created = await c.bookings.create([
      { resourceId: rid, start: T0, end: T0 + HOUR, label: "early" },
      { resourceId: rid, start: T0 + HOUR, end: T0 + 2 * HOUR, label: "middle" },
      { resourceId: rid, start: T0 + 2 * HOUR, end: T0 + 3 * HOUR, label: "late" },
    ]);

    const all = await c.bookings.get(rid);
    expect(all.length).toBe(3);

    // [T0, T0+1h) touches the window boundary only at its end; half-open overlap excludes it.
    const windowed = await c.bookings.get(rid, { start: T0 + HOUR, end: T0 + 2 * HOUR });
    expect(windowed).toEqual([
      { id: created[1].id, resourceId: rid, start: T0 + HOUR, end: T0 + 2 * HOUR, label: "middle" },
    ]);
  });

  test("labels with single quotes survive the multi-row $N builder", async () => {
    const c = client();
    const rid = await openResource();
    const hostile = `O'Hare '); DROP TABLE bookings; --`;
    const created = await c.bookings.create([
      { resourceId: rid, start: T0, end: T0 + HOUR, label: hostile },
      { resourceId: rid, start: T0 + HOUR, end: T0 + 2 * HOUR },
    ]);

    const readBack = await c.bookings.get(rid);
    expect(readBack.find((b) => b.id === created[0].id)?.label).toBe(hostile);
    expect(readBack.find((b) => b.id === created[1].id)?.label).toBeNull();
  });

  test("cancel frees the slot", async () => {
    const c = client();
    const rid = await openResource();
    const [b] = await c.bookings.create([{ resourceId: rid, start: T0, end: T0 + HOUR }]);
    await c.bookings.cancel(b.id);
    expect(await c.bookings.get(rid)).toEqual([]);
    // The span is genuinely reusable, not just invisible.
    await c.bookings.create([{ resourceId: rid, start: T0, end: T0 + HOUR }]);
  });
});

describe.skipIf(!enabled)("holds", () => {
  test("place round-trips through get and release removes it", async () => {
    const c = client();
    const rid = await openResource();
    const expiresAt = Date.now() + HOLD_TTL;
    const hold = await c.holds.place({ resourceId: rid, start: T0, end: T0 + HOUR, expiresAt });

    // Under the server's TTL cap, so the server-side clamp (when present) leaves it untouched.
    expect(await c.holds.get(rid)).toEqual([
      { id: hold.id, resourceId: rid, start: T0, end: T0 + HOUR, expiresAt },
    ]);

    await c.holds.release(hold.id);
    expect(await c.holds.get(rid)).toEqual([]);
  });

  test("a live hold blocks a conflicting booking", async () => {
    const c = client();
    const rid = await openResource();
    await c.holds.place({ resourceId: rid, start: T0, end: T0 + HOUR, expiresAt: Date.now() + HOLD_TTL });
    await expect(
      c.bookings.create([{ resourceId: rid, start: T0, end: T0 + HOUR }])
    ).rejects.toThrow();
  });
});

describe.skipIf(!enabled || !commitHold.supported)("holds.commit", () => {
  test("commit converts the hold into a booking and consumes it", async () => {
    const c = client();
    const rid = await openResource();
    const hold = await c.holds.place({
      resourceId: rid,
      start: T0,
      end: T0 + HOUR,
      expiresAt: Date.now() + HOLD_TTL,
    });

    const { bookingId } = await c.holds.commit(hold.id, { label: "committed seat" });

    const bookings = await c.bookings.get(rid);
    expect(bookings).toEqual([
      { id: bookingId, resourceId: rid, start: T0, end: T0 + HOUR, label: "committed seat" },
    ]);
    expect(await c.holds.get(rid)).toEqual([]);
  });

  test("committing a released hold rejects", async () => {
    const c = client();
    const rid = await openResource();
    const hold = await c.holds.place({
      resourceId: rid,
      start: T0,
      end: T0 + HOUR,
      expiresAt: Date.now() + HOLD_TTL,
    });
    await c.holds.release(hold.id);
    await expect(c.holds.commit(hold.id)).rejects.toThrow();
  });
});

describe.skipIf(!enabled)("availability", () => {
  test("single resource: a booking splits the open window; minDuration drops short slots", async () => {
    const c = client();
    const r = await c.resources.create({ name: `avail-${ulid()}` });
    await c.rules.create([{ resourceId: r.id, start: T0, end: T0 + DAY }]);
    await c.bookings.create([{ resourceId: r.id, start: T0 + 2 * HOUR, end: T0 + 3 * HOUR }]);

    const slots = await c.availability.get({ resourceId: r.id, start: T0, end: T0 + DAY });
    expect(slots).toEqual([
      { start: T0, end: T0 + 2 * HOUR },
      { start: T0 + 3 * HOUR, end: T0 + DAY },
    ]);

    const long = await c.availability.get({
      resourceId: r.id,
      start: T0,
      end: T0 + DAY,
      minDuration: 3 * HOUR,
    });
    expect(long).toEqual([{ start: T0 + 3 * HOUR, end: T0 + DAY }]);
  });

  test("getCombined intersects by default and unions with minAvailable 1", async () => {
    const c = client();
    const a = await c.resources.create({ name: `combA-${ulid()}` });
    const b = await c.resources.create({ name: `combB-${ulid()}` });
    for (const r of [a, b]) {
      await c.rules.create([{ resourceId: r.id, start: T0, end: T0 + DAY }]);
    }
    await c.bookings.create([{ resourceId: a.id, start: T0, end: T0 + 12 * HOUR }]);

    const both = await c.availability.getCombined({
      resourceIds: [a.id, b.id],
      start: T0,
      end: T0 + DAY,
    });
    expect(both).toEqual([{ start: T0 + 12 * HOUR, end: T0 + DAY }]);

    const any = await c.availability.getCombined({
      resourceIds: [a.id, b.id],
      start: T0,
      end: T0 + DAY,
      minAvailable: 1,
    });
    expect(any).toEqual([{ start: T0, end: T0 + DAY }]);
  });

  test("getMany keeps rows per resource and includes empty entries for bare resources", async () => {
    const c = client();
    const a = await c.resources.create({ name: `manyA-${ulid()}` });
    const b = await c.resources.create({ name: `manyB-${ulid()}` });
    const bare = await c.resources.create({ name: `manyBare-${ulid()}` });
    for (const r of [a, b]) {
      await c.rules.create([{ resourceId: r.id, start: T0, end: T0 + DAY }]);
    }
    await c.bookings.create([{ resourceId: a.id, start: T0, end: T0 + 12 * HOUR }]);

    const grouped = await c.availability.getMany({
      resourceIds: [a.id, b.id, bare.id],
      start: T0,
      end: T0 + DAY,
    });
    expect(grouped[a.id]).toEqual([{ start: T0 + 12 * HOUR, end: T0 + DAY }]);
    expect(grouped[b.id]).toEqual([{ start: T0, end: T0 + DAY }]);
    expect(grouped[bare.id]).toEqual([]);
  });
});

describe.skipIf(!enabled)("getMany grouping", () => {
  test("bookings and holds group by resource with empty arrays for untouched ids", async () => {
    const c = client();
    const [s1, s2, s3] = await Promise.all([openResource(), openResource(), openResource()]);
    const booked = await c.bookings.create([
      { resourceId: s1, start: T0, end: T0 + HOUR },
      { resourceId: s1, start: T0 + HOUR, end: T0 + 2 * HOUR },
    ]);
    const held = await c.holds.place({
      resourceId: s2,
      start: T0,
      end: T0 + HOUR,
      expiresAt: Date.now() + HOLD_TTL,
    });

    const bookings = await c.bookings.getMany([s1, s2, s3]);
    expect(Object.keys(bookings).sort()).toEqual([s1, s2, s3].sort());
    expect(bookings[s1].map((b) => b.id).sort()).toEqual(booked.map((b) => b.id).sort());
    expect(bookings[s2]).toEqual([]);
    expect(bookings[s3]).toEqual([]);

    const holds = await c.holds.getMany([s1, s2, s3]);
    expect(holds[s1]).toEqual([]);
    expect(holds[s2].map((h) => h.id)).toEqual([held.id]);
    expect(holds[s3]).toEqual([]);
  });

  test("a full chunk of MAX_IN_CLAUSE_IDS ids goes through in one IN-clause query", async () => {
    const c = client();
    const resources = await c.resources.createMany(
      Array.from({ length: MAX_IN_CLAUSE_IDS }, (_, i) => ({ name: `bulk-${i}` }))
    );
    const ids = resources.map((r) => r.id);
    await c.rules.create([{ resourceId: ids[0], start: T0 - DAY, end: T0 + 2 * DAY }]);
    const [b] = await c.bookings.create([{ resourceId: ids[0], start: T0, end: T0 + HOUR }]);

    const grouped = await c.bookings.getMany(ids);
    expect(Object.keys(grouped).length).toBe(MAX_IN_CLAUSE_IDS);
    expect(grouped[ids[0]].map((x) => x.id)).toEqual([b.id]);
    expect(Object.entries(grouped).filter(([, v]) => v.length > 0).length).toBe(1);
  });
});
