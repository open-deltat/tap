import { classifyRefusal, sqlstateOf, type DeltaT } from "@open-deltat/client";

// Turning a hold into a booking, and saying honestly what happened when the reply goes missing.
//
// A commit's failure is not always a "no". The kernel may apply it and lose the reply on the way
// back, or apply it a moment after the client gave up (it applies before fsync since deltat#47). A
// caller that reads every rejection as "not booked" lets its user try again and book twice. So:
// only the kernel's definite refusal means not booked; anything else is settled by releasing the
// hold and then reading what is on the span; and when even that fails, the answer is "unknown",
// which callers must treat as possibly booked (INV-01's direction: stuck, never twice).

export type CommitOutcome =
  | { readonly kind: "booked"; readonly bookingId: string }
  | { readonly kind: "not_booked" }
  | { readonly kind: "unknown" };

export interface CommitTarget {
  readonly resourceId: string;
  readonly holdId: string;
  readonly start: number;
  readonly end: number;
  /**
   * The booking's kernel label: an opaque reference unique to this commit (booking-details.ts
   * `opaqueRef`), never a person's name. Its uniqueness is how the read-back recognises the booking.
   */
  readonly label: string;
}

/**
 * The kernel answered and said no: the hold is unknown or expired. A real SQLSTATE is five digits or
 * capitals; a socket error code ("ECONNRESET") is not, and its message must never be read as the
 * kernel's answer, whatever it says.
 */
export function isDefiniteRefusal(err: unknown): boolean {
  const state = sqlstateOf(err);
  if (state === null || !/^[0-9A-Z]{5}$/.test(state)) return false;
  const { code } = classifyRefusal(err);
  return code === "EXPIRED" || code === "NOT_FOUND";
}

/**
 * Release the hold FIRST, then read: any read taken before the release is answered is a snapshot a
 * late commit can overtake. Once the release is answered, a late commit was ordered before it (and
 * shows as a booking) or after it (and finds no hold, so books nothing). A booking on exactly the
 * span under our label means it landed; none means it did not. A release that fails, other than
 * "that hold is gone" (which also leaves the bookings to decide), or a failed read, is unknown.
 */
async function settleUnclearCommit(dt: DeltaT, target: CommitTarget): Promise<CommitOutcome> {
  const released = await dt.holds.release(target.holdId).then(
    () => true,
    (err: unknown) => isDefiniteRefusal(err)
  );
  if (!released) return { kind: "unknown" };
  const bookings = await dt.bookings.get(target.resourceId, { start: target.start, end: target.end }).catch(() => null);
  if (!bookings) return { kind: "unknown" };
  const made = bookings.find((b) => b.start === target.start && b.end === target.end && b.label === target.label);
  return made ? { kind: "booked", bookingId: made.id } : { kind: "not_booked" };
}

/**
 * Commit a hold. `not_booked` after a definite refusal leaves the (unknown or expired) hold as it is;
 * after an unclear failure the hold has already been released. Never throws.
 */
export async function commitAndConfirm(dt: DeltaT, target: CommitTarget): Promise<CommitOutcome> {
  const answered = await dt.holds.commit(target.holdId, { label: target.label }).then(
    ({ bookingId }): CommitOutcome => ({ kind: "booked", bookingId }),
    (err: unknown): CommitOutcome | null => (isDefiniteRefusal(err) ? { kind: "not_booked" } : null)
  );
  return answered ?? settleUnclearCommit(dt, target).catch((): CommitOutcome => ({ kind: "unknown" }));
}
