import type { Booking, DeltaTEvent, Hold } from "./types.js";

/**
 * What changed on a calendar, in a form a person or an agent can act on.
 *
 * `Events.listen` hands over the kernel's own mutation log. Three things make that awkward to act
 * on, and this module is the one place that absorbs them:
 *
 *  1. It is not filtered. Every change on the resource and on its children arrives, not only the
 *     times a caller cares about. A `window` keeps the changes that overlap it.
 *  2. On kernels before deltat#42, `HoldReleased` and `BookingCancelled` carry an id and no time.
 *     The tracker remembers the span of every hold and booking it has seen, seeded from a snapshot
 *     when watching starts, so the end of one can say when it was. Newer kernels send the span.
 *  3. Committing a hold emits `HoldReleased` and then `BookingConfirmed` for the same span. Newer
 *     kernels say so (`reason: "committed"`) and the release is simply dropped. For older ones a
 *     release is parked for SETTLE_MS and dropped if a booking on its exact span claims it, so a
 *     commit never reads as "free" first. Each release is parked on its own, so commits on sibling
 *     resources that interleave on a parent's channel still pair up.
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

/**
 * How long a release from an older kernel waits for the booking that would show it was a commit.
 * The kernel sends the pair back to back, so this only has to cover them landing in separate reads
 * off the socket; it is also how late such a release is reported.
 */
export const SETTLE_MS = 100;

/**
 * Spans remembered for older kernels. Past this the oldest is forgotten first, so an ending that
 * old reports its time as unknown rather than the tracker growing without limit.
 */
const REMEMBER_LIMIT = 10_000;

type HoldEnded = Extract<Change, { kind: "hold_ended" }>;
type Window = { start: number; end: number };
type Placed = { resourceId: string; start: number; end: number };

const overlaps = (start: number, end: number, w: Window): boolean => start < w.end && w.start < end;

export class ChangeTracker {
  private readonly placed = new Map<string, Placed>();
  /** Releases from older kernels waiting to see whether a booking claims them, by hold id. */
  private readonly parked = new Map<string, { change: HoldEnded; at: number }>();
  /**
   * Set once an ending arrives with its own span: the kernel describes endings (deltat#42), so there
   * is nothing to remember and the memory is dropped.
   */
  private kernelDescribesEndings = false;

  constructor(
    private readonly window: Window | null,
    seed: { holds: readonly Hold[]; bookings: readonly Booking[] }
  ) {
    for (const { id, resourceId, start, end } of [...seed.holds, ...seed.bookings]) {
      this.remember(id, { resourceId, start, end });
    }
  }

  /** When the earliest parked release is due to be reported, or null when none is parked. */
  nextDeadline(): number | null {
    const ats = [...this.parked.values()].map((p) => p.at + SETTLE_MS);
    return ats.length ? Math.min(...ats) : null;
  }

  /** The changes this event settles. `now` is when it arrived, used only to time parked releases. */
  apply(event: DeltaTEvent, now: number): Change[] {
    if ("HoldPlaced" in event) {
      const { id, resource_id, span, expires_at } = event.HoldPlaced;
      this.remember(id, { resourceId: resource_id, ...span });
      return this.keep([{ kind: "held", resourceId: resource_id, holdId: id, ...span, expiresAt: expires_at }]);
    }
    if ("HoldReleased" in event) {
      const { id, resource_id, span, reason } = event.HoldReleased;
      if (span) this.describedByKernel();
      const remembered = this.forget(id);
      const known = span ?? remembered;
      const ended: HoldEnded = { kind: "hold_ended", resourceId: resource_id, holdId: id, start: known?.start ?? null, end: known?.end ?? null };
      if (reason === "committed") return [];
      if (reason !== undefined) return this.keep([ended]);
      this.parked.set(id, { change: ended, at: now });
      return [];
    }
    if ("BookingConfirmed" in event) {
      const { id, resource_id, span } = event.BookingConfirmed;
      this.remember(id, { resourceId: resource_id, ...span });
      const claimed = [...this.parked].find(
        ([, p]) => p.change.resourceId === resource_id && p.change.start === span.start && p.change.end === span.end
      );
      if (claimed) this.parked.delete(claimed[0]);
      return this.keep([{ kind: "booked", resourceId: resource_id, bookingId: id, ...span }]);
    }
    if ("BookingCancelled" in event) {
      const { id, resource_id, span } = event.BookingCancelled;
      if (span) this.describedByKernel();
      const remembered = this.forget(id);
      const known = span ?? remembered;
      return this.keep([
        { kind: "cancelled", resourceId: resource_id, bookingId: id, start: known?.start ?? null, end: known?.end ?? null },
      ]);
    }
    // Rules and resources are not bookings (replacing opening hours alone emits one event per
    // segment), and Lagged is not a change: the watch re-reads the calendar for it.
    return [];
  }

  /** Report the parked releases whose booking has had SETTLE_MS to arrive and did not. */
  settle(now: number): Change[] {
    const due = [...this.parked].filter(([, p]) => p.at + SETTLE_MS <= now).sort(([, a], [, b]) => a.at - b.at);
    for (const [id] of due) this.parked.delete(id);
    return this.keep(due.map(([, p]) => p.change));
  }

  /** Report every parked release now, for a watch that is about to re-read or stop. */
  flush(): Change[] {
    return this.settle(Number.POSITIVE_INFINITY);
  }

  private remember(id: string, span: Placed): void {
    if (this.kernelDescribesEndings) return;
    // With a window, a span outside it can never be reported, so there is nothing to remember.
    if (this.window && !overlaps(span.start, span.end, this.window)) return;
    this.placed.set(id, span);
    // A Map keeps insertion order, so its first key is the oldest span: forgetting it is O(1), and
    // an unwindowed watch on a busy calendar stays at REMEMBER_LIMIT however long it runs.
    if (this.placed.size > REMEMBER_LIMIT) {
      const oldest = this.placed.keys().next();
      if (!oldest.done) this.placed.delete(oldest.value);
    }
  }

  private describedByKernel(): void {
    this.kernelDescribesEndings = true;
    this.placed.clear();
  }

  private forget(id: string): Placed | undefined {
    const span = this.placed.get(id);
    this.placed.delete(id);
    return span;
  }

  /**
   * Inside the window, or everything when there is none. With a window, an end whose time is
   * unknown is dropped: the snapshot covered every hold and booking in the window on the watched
   * calendar, so an unknown one lies outside it or belongs to a child booked before watching began.
   */
  private keep(changes: Change[]): Change[] {
    const w = this.window;
    if (w === null) return changes;
    return changes.filter((c) => c.start !== null && c.end !== null && overlaps(c.start, c.end, w));
  }
}
