import { test, expect } from "bun:test";
import { scheduleChanges, type ScheduleSnapshot } from "../schedule-diff";

// The owner's activity log used to read kernel payloads off the socket. The socket now carries only
// a tick, so the log is the difference between two owner reads.

const EMPTY: ScheduleSnapshot = { bookings: [], holds: [] };
const HOLD = { start: 1_000, end: 2_000, expiresAt: 9_000 };
const BOOKING = { id: "b1", start: 1_000, end: 2_000 };

test("a new hold and a new booking each log once", () => {
  expect(scheduleChanges(EMPTY, { bookings: [], holds: [HOLD] })).toEqual([
    { kind: "held", start: 1_000, expiresAt: 9_000 },
  ]);
  expect(scheduleChanges(EMPTY, { bookings: [BOOKING], holds: [] })).toEqual([
    { kind: "booked", bookingId: "b1", start: 1_000 },
  ]);
});

test("a hold that became a booking logs as the booking, not as a release", () => {
  expect(scheduleChanges({ bookings: [], holds: [HOLD] }, { bookings: [BOOKING], holds: [] })).toEqual([
    { kind: "booked", bookingId: "b1", start: 1_000 },
  ]);
});

test("a hold let go and a booking cancelled each log", () => {
  expect(scheduleChanges({ bookings: [BOOKING], holds: [{ ...HOLD, start: 5_000, end: 6_000 }] }, EMPTY)).toEqual([
    { kind: "cancelled", bookingId: "b1" },
    { kind: "released", start: 5_000 },
  ]);
});

test("the same read twice logs nothing", () => {
  const snap = { bookings: [BOOKING], holds: [HOLD] };
  expect(scheduleChanges(snap, snap)).toEqual([]);
});
