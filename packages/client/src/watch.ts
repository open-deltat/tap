import type { Booking, DeltaTEvent, Hold } from "./types.js";

/**
 * What changed on a calendar, in a form a person or an agent can act on.
 *
 * `Events.listen` hands over the kernel's own mutation log. Three things make that awkward to act
 * on, and this module is the one place that absorbs them:
 *
 *  1. It is not filtered. Every change on the resource and on its children arrives, not only the
 *     times a caller cares about. A `window` keeps the changes that overlap it.
 *  2. `HoldReleased` and `BookingCancelled` carry an id and no time. The tracker remembers the span
 *     of every hold and booking it has seen, seeded from a snapshot when watching starts, so the
 *     end of one can say when it was.
 *  3. Committing a hold emits `HoldReleased` and then `BookingConfirmed` for the same span. The
 *     kernel sends the two back to back under one lock (commit_hold in engine/mutations.rs), so a
 *     release is parked until the next event: dropped if that event is the booking on its span,
 *     reported otherwise. Read naively, every booking would first announce its time as free.
 *
 * (2) and (3) exist because today's events are not self-describing. Once the kernel says on which
 * span and why a hold ended, the tracker loses its memory and its parking spot.
 *
 * Booking labels are left out on purpose. Whoever books sets them, and a change stream is read
 * unprompted, often by a model, so free text from strangers does not belong in it.
 */
export type Change =
  | { kind: "held"; resourceId: string; holdId: string; start: number; end: number; expiresAt: number }
  | { kind: "booked"; resourceId: string; bookingId: string; start: number; end: number }
  /** Released or expired without becoming a booking. Its time may be free again. */
  | { kind: "hold_ended"; resourceId: string; holdId: string; start: number | null; end: number | null }
  /** Its time may be free again. */
  | { kind: "cancelled"; resourceId: string; bookingId: string; start: number | null; end: number | null };

type HoldEnded = Extract<Change, { kind: "hold_ended" }>;
type Window = { start: number; end: number };
type Placed = { resourceId: string; start: number; end: number };

const overlaps = (start: number, end: number, w: Window): boolean => start < w.end && w.start < end;

export class ChangeTracker {
  private readonly placed = new Map<string, Placed>();
  private parked: HoldEnded | null = null;

  constructor(
    private readonly window: Window | null,
    seed: { holds: readonly Hold[]; bookings: readonly Booking[] }
  ) {
    for (const { id, resourceId, start, end } of [...seed.holds, ...seed.bookings]) {
      this.placed.set(id, { resourceId, start, end });
    }
  }

  /** A hold release is parked, waiting to see whether a booking claims it. Call settle() if none does. */
  get waiting(): boolean {
    return this.parked !== null;
  }

  /** The changes this event settles, in order. A hold release is parked rather than returned. */
  apply(event: DeltaTEvent): Change[] {
    if ("BookingConfirmed" in event) {
      const { id, resource_id, span } = event.BookingConfirmed;
      this.placed.set(id, { resourceId: resource_id, ...span });
      const parked = this.parked;
      this.parked = null;
      const claimed =
        parked !== null && parked.resourceId === resource_id && parked.start === span.start && parked.end === span.end;
      const earlier = parked !== null && !claimed ? this.keep([parked]) : [];
      return [...earlier, ...this.keep([{ kind: "booked", resourceId: resource_id, bookingId: id, ...span }])];
    }

    const earlier = this.settle();

    if ("HoldPlaced" in event) {
      const { id, resource_id, span, expires_at } = event.HoldPlaced;
      this.placed.set(id, { resourceId: resource_id, ...span });
      return [
        ...earlier,
        ...this.keep([{ kind: "held", resourceId: resource_id, holdId: id, ...span, expiresAt: expires_at }]),
      ];
    }
    if ("HoldReleased" in event) {
      const { id, resource_id } = event.HoldReleased;
      const span = this.forget(id);
      this.parked = { kind: "hold_ended", resourceId: resource_id, holdId: id, start: span?.start ?? null, end: span?.end ?? null };
      return earlier;
    }
    if ("BookingCancelled" in event) {
      const { id, resource_id } = event.BookingCancelled;
      const span = this.forget(id);
      return [
        ...earlier,
        ...this.keep([
          { kind: "cancelled", resourceId: resource_id, bookingId: id, start: span?.start ?? null, end: span?.end ?? null },
        ]),
      ];
    }
    // Rules and resources are not bookings. Replacing opening hours alone emits one event per
    // segment, which would bury the changes a watcher is here for.
    return earlier;
  }

  /** Report a parked hold release that no booking claimed. */
  settle(): Change[] {
    const parked = this.parked;
    this.parked = null;
    return parked ? this.keep([parked]) : [];
  }

  private forget(id: string): Placed | undefined {
    const span = this.placed.get(id);
    this.placed.delete(id);
    return span;
  }

  /**
   * Inside the window, or everything when there is none. With a window, an end whose time is
   * unknown is dropped: the snapshot covered every hold and booking on the watched calendar, so an
   * unknown one belongs to a child calendar that was booked before watching started.
   */
  private keep(changes: Change[]): Change[] {
    const w = this.window;
    if (w === null) return changes;
    return changes.filter((c) => c.start !== null && c.end !== null && overlaps(c.start, c.end, w));
  }
}
