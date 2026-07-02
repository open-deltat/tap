/**
 * Smoke test: the seat hold → book lifecycle persists.
 *
 * Regression guard for the intermittent "booked seats don't persist" bug. deltat treats an
 * active hold as a conflict, so booking a seat that still carries its own hold makes the
 * atomic batch_confirm_bookings reject the WHOLE booking. releaseHoldsThenBook (the exact
 * helper the app uses) releases first, so the booking lands deterministically.
 *
 * Run against a local deltat:  DELTAT_PORT=5434 bun scripts/smoke-seat-hold-booking.ts
 */
import { DeltaT } from "@open-deltat/client";
import { releaseHoldsThenBook } from "../lib/booking-flow";

const PORT = Number(process.env.DELTAT_PORT ?? 5434);
const dt = new DeltaT({ port: PORT, password: "secret", database: "demo" });

const START_MS = 2_100_000_000_000;
const END_MS = START_MS + 3_600_000;
const OPEN_START_MS = START_MS - 86_400_000;
const OPEN_END_MS = START_MS + 86_400_000;
const expiresAtMs = Date.now() + 300_000;

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ✓" : "  ✗ FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
  if (!condition) failures++;
}

async function freshOpenSeat(name: string): Promise<string> {
  const seat = await dt.resources.create({ name, capacity: 1 });
  await dt.rules.create([{ resourceId: seat.id, start: OPEN_START_MS, end: OPEN_END_MS, blocking: false }]);
  return seat.id;
}
async function bookedCount(seatId: string): Promise<number> {
  const bookings = await dt.bookings.get(seatId);
  return bookings.filter((b) => b.start < END_MS && b.end > START_MS).length;
}

try {
  console.log(`\nseat hold→book smoke test against deltat :${PORT}\n`);

  // 1. Two HELD seats booked via releaseHoldsThenBook → both persist (the app path).
  const seatA = await freshOpenSeat("smoke-A");
  const seatB = await freshOpenSeat("smoke-B");
  await dt.holds.place({ resourceId: seatA, start: START_MS, end: END_MS, expiresAt: expiresAtMs });
  await dt.holds.place({ resourceId: seatB, start: START_MS, end: END_MS, expiresAt: expiresAtMs });

  const booked = await releaseHoldsThenBook(dt, {
    seatIds: [seatA, seatB],
    start: START_MS,
    end: END_MS,
    label: "smoke",
  });
  check("releaseHoldsThenBook returns 2 bookings", booked.length === 2, `got ${booked.length}`);
  check("seat A booking persists", (await bookedCount(seatA)) === 1);
  check("seat B booking persists", (await bookedCount(seatB)) === 1);
  check("seat A hold is gone", (await dt.holds.get(seatA, { start: START_MS, end: END_MS })).length === 0);

  // 2. The bug it guards against: booking held seats WITHOUT releasing is rejected atomically.
  const seatC = await freshOpenSeat("smoke-C");
  const seatD = await freshOpenSeat("smoke-D");
  await dt.holds.place({ resourceId: seatC, start: START_MS, end: END_MS, expiresAt: expiresAtMs });
  await dt.holds.place({ resourceId: seatD, start: START_MS, end: END_MS, expiresAt: expiresAtMs });
  let wasRejected = false;
  try {
    await dt.bookings.create([
      { resourceId: seatC, start: START_MS, end: END_MS },
      { resourceId: seatD, start: START_MS, end: END_MS },
    ]);
  } catch {
    wasRejected = true;
  }
  check("naive book-while-held is rejected (why release-first is required)", wasRejected);
  check("seat C stays unbooked after the rejected batch", (await bookedCount(seatC)) === 0);

  // 3. A personal-calendar mirror that's ALREADY occupied at the slot must NOT block the
  //    seat booking, the mirror is best-effort, the seats still persist.
  const calendar = await freshOpenSeat("smoke-calendar");
  await dt.bookings.create([{ resourceId: calendar, start: START_MS, end: END_MS, label: "busy" }]); // pre-occupy
  const seatE = await freshOpenSeat("smoke-E");
  await dt.holds.place({ resourceId: seatE, start: START_MS, end: END_MS, expiresAt: expiresAtMs });
  await releaseHoldsThenBook(dt, {
    seatIds: [seatE],
    start: START_MS,
    end: END_MS,
    label: "smoke",
    calendar: { resourceId: calendar, label: "mirror" },
  });
  check("seat persists even when the calendar mirror conflicts", (await bookedCount(seatE)) === 1);

  console.log(failures === 0 ? "\nPASS: hold→book persists.\n" : `\nFAIL: ${failures} check(s) failed.\n`);
} finally {
  await dt.close();
}

process.exit(failures === 0 ? 0 : 1);
