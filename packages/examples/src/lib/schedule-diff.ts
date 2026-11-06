/** A hold as the owner's dashboard sees it: where and until when, never its id (the id is authority). */
export interface HeldSpan {
  start: number;
  end: number;
  expiresAt: number;
}

export interface ScheduleSnapshot {
  bookings: readonly { id: string; start: number; end: number }[];
  holds: readonly HeldSpan[];
}

export type ScheduleChange =
  | { kind: "booked"; bookingId: string; start: number }
  | { kind: "cancelled"; bookingId: string }
  | { kind: "held"; start: number; expiresAt: number }
  | { kind: "released"; start: number };

const spanKey = (s: { start: number; end: number }) => `${s.start}-${s.end}`;
const holdKey = (h: HeldSpan) => `${spanKey(h)}-${h.expiresAt}`;

/**
 * What happened between two reads of one calendar, for the activity log. The live socket only says
 * "something changed", so the log is rebuilt from what the owner may read. A hold that disappears
 * where a booking appeared on the same span was booked, not let go, so it logs once, as the booking.
 */
export function scheduleChanges(prev: ScheduleSnapshot, next: ScheduleSnapshot): ScheduleChange[] {
  const prevBookings = new Set(prev.bookings.map((b) => b.id));
  const nextBookings = new Set(next.bookings.map((b) => b.id));
  const prevHolds = new Set(prev.holds.map(holdKey));
  const nextHolds = new Set(next.holds.map(holdKey));
  const booked = next.bookings.filter((b) => !prevBookings.has(b.id));
  const bookedSpans = new Set(booked.map(spanKey));

  return [
    ...booked.map((b): ScheduleChange => ({ kind: "booked", bookingId: b.id, start: b.start })),
    ...prev.bookings
      .filter((b) => !nextBookings.has(b.id))
      .map((b): ScheduleChange => ({ kind: "cancelled", bookingId: b.id })),
    ...next.holds
      .filter((h) => !prevHolds.has(holdKey(h)))
      .map((h): ScheduleChange => ({ kind: "held", start: h.start, expiresAt: h.expiresAt })),
    ...prev.holds
      .filter((h) => !nextHolds.has(holdKey(h)) && !bookedSpans.has(spanKey(h)))
      .map((h): ScheduleChange => ({ kind: "released", start: h.start })),
  ];
}
