import { test, expect } from "bun:test";
import type { DeltaTEvent } from "@open-deltat/client";
import { forwardChanges } from "../live-changes";

// The /ws bridge is open to anyone who can name a published calendar. A kernel notification carries
// the hold id, and the hold id is what release and commit accept as authority, so a watcher must
// learn only that something changed and read what it may see through its own gated path.

const HOLD_ID = "hold-secret-0123456789";
const BOOKING_ID = "booking-0123456789";

const EVENTS: DeltaTEvent[] = [
  { HoldPlaced: { id: HOLD_ID, resource_id: "cal1", span: { start: 1_000, end: 2_000 }, expires_at: 3_000 } },
  { HoldReleased: { id: HOLD_ID, resource_id: "cal1" } },
  { BookingConfirmed: { id: BOOKING_ID, resource_id: "cal1", span: { start: 1_000, end: 2_000 } } },
  { BookingCancelled: { id: BOOKING_ID, resource_id: "cal1" } },
] as DeltaTEvent[];

async function framesFor(events: readonly DeltaTEvent[]): Promise<string[]> {
  const sent: string[] = [];
  await forwardChanges(
    async (_resourceId, onEvent) => {
      events.forEach(onEvent);
      return async () => {};
    },
    "cal1",
    (frame) => sent.push(frame)
  );
  return sent;
}

test("every kernel change reaches the socket as a bare changed tick", async () => {
  const frames = await framesFor(EVENTS);
  expect(frames).toHaveLength(EVENTS.length);
  frames.forEach((frame) => expect(JSON.parse(frame)).toEqual({ type: "changed" }));
});

test("no frame carries a hold id, a booking id, or a span", async () => {
  const joined = (await framesFor(EVENTS)).join("\n");
  expect(joined).not.toContain(HOLD_ID);
  expect(joined).not.toContain(BOOKING_ID);
  expect(joined).not.toContain("1000");
});

test("it listens on the calendar it was asked for and hands back the unlisten", async () => {
  const asked: string[] = [];
  const unlisten = async () => {};
  const got = await forwardChanges(
    async (resourceId) => {
      asked.push(resourceId);
      return unlisten;
    },
    "cal9",
    () => {}
  );
  expect(asked).toEqual(["cal9"]);
  expect(got).toBe(unlisten);
});
