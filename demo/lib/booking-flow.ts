import type { DeltaT, Booking } from "@open-tap/client";

export interface BookHeldSeatsInput {
  seatIds: string[];
  start: number;
  end: number;
  label?: string;
  /** Optional personal-calendar mirror booking for the same window. */
  calendar?: { resourceId: string; label: string };
}

/**
 * Convert a client's held seats into confirmed bookings.
 *
 * deltat's conflict check treats an active hold as a conflict, so booking a seat that
 * still carries its own hold makes the atomic `batch_confirm_bookings` reject the whole
 * batch, and the booking silently fails to persist. The holds must therefore be released
 * BEFORE the booking, awaited in order, so the outcome is deterministic rather than a race
 * against an unawaited socket-close release.
 *
 * The race-free engine-native version is the planned atomic CommitHold (AVAIL-07): one op
 * that converts hold→booking under a single lock, excluding that hold from the conflict
 * check. Until that lands, releasing first is the correct, low-risk behaviour.
 */
export async function releaseHoldsThenBook(
  dt: DeltaT,
  input: BookHeldSeatsInput,
): Promise<Booking[]> {
  const { seatIds, start, end, label, calendar } = input;

  await Promise.all(
    seatIds.map(async (seatId) => {
      const heldOverlapping = await dt.holds.get(seatId, { start, end });
      await Promise.all(heldOverlapping.map((hold) => dt.holds.release(hold.id).catch(() => {})));
    }),
  );

  // Book the seats atomically (all-or-nothing across the selected seats).
  const seatSlots = seatIds.map((resourceId) => ({ resourceId, start, end, label: label || undefined }));
  const bookings = await dt.bookings.create(seatSlots);

  // Mirror to the personal calendar as a best-effort REFLECTION, in a SEPARATE booking.
  // It must never be able to roll back the seat booking: the shared calendar is capacity-1,
  // so it conflicts whenever you already have something at this time, which must not stop
  // you from holding a seat. A conflict here just means "already on your calendar".
  if (calendar) {
    try {
      await dt.bookings.create([{ resourceId: calendar.resourceId, start, end, label: calendar.label }]);
    } catch {
      // calendar already occupied at this time, the seat booking still stands
    }
  }

  return bookings;
}
