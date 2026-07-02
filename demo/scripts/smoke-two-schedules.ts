/**
 * Smoke test: the cross-schedule "2D math".
 *
 * Two people's calendars, each partly busy. We ask deltat for the times BOTH are free
 * (combined availability, minAvailable = 2, the intersection), book a meeting in the
 * overlap atomically on both calendars, and confirm the slot disappears from the overlap.
 * This exercises the real frontend path: @open-tap/client -> pgwire -> deltat engine.
 *
 * Run against a local deltat:  DELTAT_PORT=5434 bun scripts/smoke-two-schedules.ts
 */
import { DeltaT } from "@open-tap/client";

const PORT = Number(process.env.DELTAT_PORT ?? 5434);
const H = 3_600_000;
const D = 1_700_000_000_000; // a fixed instant, deterministic, no wall clock
const at = (hour: number) => D + hour * H;
const hrs = (ms: number) => (ms - D) / H;
const fmt = (slots: { start: number; end: number }[]) =>
  slots.map((s) => `${hrs(s.start)}–${hrs(s.end)}`).join(", ") || "(none)";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
  if (!cond) failures++;
}

const dt = new DeltaT({ port: PORT });

try {
  console.log(`\n2D-math smoke test against deltat :${PORT}\n`);

  // Two person-calendars, each open 9–17.
  const alice = await dt.resources.create({ name: "Alice" });
  const bob = await dt.resources.create({ name: "Bob" });
  await dt.rules.create([
    { resourceId: alice.id, start: at(9), end: at(17), blocking: false },
    { resourceId: bob.id, start: at(9), end: at(17), blocking: false },
  ]);

  // Make each busy at different times: Alice 9–11, Bob 10–12.
  await dt.bookings.create([{ resourceId: alice.id, start: at(9), end: at(11), label: "Alice: standup" }]);
  await dt.bookings.create([{ resourceId: bob.id, start: at(10), end: at(12), label: "Bob: review" }]);

  // The intersection: where BOTH are free. Alice free 11–17; Bob free 9–10 & 12–17 → both = 12–17.
  const both = await dt.availability.getCombined({
    resourceIds: [alice.id, bob.id], start: at(0), end: at(24), minAvailable: 2,
  });
  console.log(`  both-free: ${fmt(both)}`);
  check("intersection is exactly 12–17", both.length === 1 && hrs(both[0].start) === 12 && hrs(both[0].end) === 17);

  // Book a 14–15 meeting on BOTH calendars atomically (the zero-sum multi-resource booking).
  const meeting = await dt.bookings.create([
    { resourceId: alice.id, start: at(14), end: at(15), label: "Alice⇄Bob meeting" },
    { resourceId: bob.id, start: at(14), end: at(15), label: "Alice⇄Bob meeting" },
  ]);
  check("atomic 2-resource booking created", meeting.length === 2);

  // The overlap now excludes 14–15 → 12–14 and 15–17.
  const after = await dt.availability.getCombined({
    resourceIds: [alice.id, bob.id], start: at(0), end: at(24), minAvailable: 2,
  });
  console.log(`  both-free after booking: ${fmt(after)}`);
  check("overlap split into 12–14 and 15–17",
    after.length === 2 && hrs(after[0].start) === 12 && hrs(after[0].end) === 14 && hrs(after[1].start) === 15 && hrs(after[1].end) === 17);

  // Collision detection: booking over Alice's existing 9–11 must be rejected.
  let conflicted = false;
  try {
    await dt.bookings.create([{ resourceId: alice.id, start: at(9), end: at(10), label: "double-book" }]);
  } catch {
    conflicted = true;
  }
  check("double-booking Alice 9–10 is rejected", conflicted);

  console.log(`\n${failures === 0 ? "PASS: the 2D math works end-to-end." : `FAIL: ${failures} check(s) failed.`}\n`);
} finally {
  await dt.close();
}

process.exit(failures === 0 ? 0 : 1);
