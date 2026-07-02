/**
 * Smoke test: bookings.getMany / holds.getMany batch a seat-map read into ONE round-trip and
 * return the SAME data as the per-seat fan-out, grouped by resource id.
 *
 * Run against a local deltat:  DELTAT_PORT=5435 bun scripts/smoke-getmany.ts
 */
import { DeltaT } from "@open-tap/client";

const PORT = Number(process.env.DELTAT_PORT ?? 5435);
const dt = new DeltaT({ port: PORT, password: "secret", database: "demo" });

const START = 2_100_000_000_000;
const END = START + 3_600_000;
const OPEN_START = START - 86_400_000;
const OPEN_END = START + 86_400_000;
const EXPIRES = Date.now() + 300_000;
const N = 40;

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "  ✓" : "  ✗ FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
  if (!ok) failures++;
};

async function freshSeat(name: string): Promise<string> {
  const seat = await dt.resources.create({ name, capacity: 1 });
  await dt.rules.create([{ resourceId: seat.id, start: OPEN_START, end: OPEN_END, blocking: false }]);
  return seat.id;
}

try {
  console.log(`\ngetMany smoke test against deltat :${PORT}\n`);

  const tag = Date.now().toString(36);
  const seatIds = await Promise.all(
    Array.from({ length: N }, (_, i) => freshSeat(`gm-${tag}-${i}`))
  );

  // Occupy a representative subset: book ~12, hold ~5.
  const bookedIds = seatIds.slice(0, 12);
  const heldIds = seatIds.slice(12, 17);
  await dt.bookings.create(bookedIds.map((id) => ({ resourceId: id, start: START, end: END, label: "x" })));
  for (const id of heldIds) {
    await dt.holds.place({ resourceId: id, start: START, end: END, expiresAt: EXPIRES });
  }

  // Fan-out reference (the OLD path): one query per seat.
  const t0 = performance.now();
  const fanBook: Record<string, number> = {};
  for (const id of seatIds) fanBook[id] = (await dt.bookings.get(id)).length;
  const fanMs = performance.now() - t0;

  // Batched (the NEW path): one query for all seats.
  const t1 = performance.now();
  const many = await dt.bookings.getMany(seatIds);
  const manyMs = performance.now() - t1;

  // Correctness: same per-seat counts, every requested id present.
  const allPresent = seatIds.every((id) => id in many);
  const sameCounts = seatIds.every((id) => (many[id]?.length ?? -1) === fanBook[id]);
  const totalBooked = seatIds.reduce((s, id) => s + (many[id]?.length ?? 0), 0);
  check("getMany returns an entry for every requested id", allPresent);
  check("getMany per-seat counts match the fan-out", sameCounts);
  check("exactly the 12 booked seats have a booking", totalBooked === 12, `got ${totalBooked}`);

  // Holds batch matches too.
  const manyHolds = await dt.holds.getMany(seatIds);
  const activeHeld = seatIds.filter((id) => (manyHolds[id] ?? []).some((h) => h.expiresAt > Date.now())).length;
  check("getMany holds finds exactly the 5 held seats", activeHeld === 5, `got ${activeHeld}`);

  // Dedup: a repeated id must not double-count.
  const dup = await dt.bookings.getMany([bookedIds[0], bookedIds[0]]);
  check("duplicate id is deduped (no re-emit)", (dup[bookedIds[0]]?.length ?? 0) === 1);

  // Empty input is a no-op.
  check("empty resourceIds returns {}", Object.keys(await dt.bookings.getMany([])).length === 0);

  console.log(
    `\n  fan-out ${N} queries: ${fanMs.toFixed(1)} ms   |   getMany 1 query: ${manyMs.toFixed(1)} ms   |   ${(fanMs / manyMs).toFixed(1)}x faster\n`
  );
  console.log(failures === 0 ? "PASS: getMany is correct and batched.\n" : `FAIL: ${failures} check(s) failed.\n`);
} finally {
  await dt.close();
}

process.exit(failures === 0 ? 0 : 1);
