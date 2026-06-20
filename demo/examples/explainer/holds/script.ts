/**
 * Scripted "Holds & race conditions" chapter — no live deltat needed.
 *
 * The seat row is fixed (6 seats); each step is a pure snapshot of how those seats look
 * on each client lane plus the caption naming the deltat mechanism. The component just
 * renders the snapshot for the current step, so prev/next/scrub is trivially deterministic.
 */

const SEAT_COUNT = 6;
/** The seat the whole story is about (0-indexed). */
export const FOCUS_SEAT = 3;

export type SeatState =
  | "free" // open, available — green
  | "hold" // short-TTL reservation — amber
  | "booked" // confirmed, atomic — blue
  | "reject"; // this client's attempt was refused — red flash ✗

export interface LaneSnapshot {
  /** Seat state per seat index. */
  seats: SeatState[];
  /** This lane is the actor in this step (subtle highlight on its label). */
  acting?: boolean;
}

export interface HoldsStep {
  title: string;
  /** The mechanism caption, mono, beneath the scrubber. */
  caption: string;
  a: LaneSnapshot;
  b: LaneSnapshot;
}

const allFree = (): SeatState[] => Array.from({ length: SEAT_COUNT }, () => "free");

/** Clone the all-free row and override individual seats. */
const row = (overrides: Array<[seat: number, state: SeatState]> = []): SeatState[] => {
  const seats = allFree();
  for (const [seat, state] of overrides) seats[seat] = state;
  return seats;
};

export const HOLDS_STEPS: HoldsStep[] = [
  {
    title: "Both see the same seats",
    caption:
      "Bob and Jane open the same screen. They both see the live seat map at once. Nobody has to refresh.",
    a: { seats: allFree() },
    b: { seats: allFree() },
  },
  {
    title: "Bob holds a seat",
    caption:
      "Bob taps seat 4. deltat puts a hold on it, so it counts as taken straight away.",
    a: { seats: row([[FOCUS_SEAT, "hold"]]), acting: true },
    b: { seats: allFree() },
  },
  {
    title: "Jane sees the hold",
    caption:
      "The hold is streamed to Jane right away, so seat 4 turns amber on their screen within a moment.",
    a: { seats: row([[FOCUS_SEAT, "hold"]]) },
    b: { seats: row([[FOCUS_SEAT, "hold"]]) },  },
  {
    title: "Jane can't take it",
    caption:
      "Jane taps seat 4, but it is already held by Bob, so deltat refuses. Jane cannot take it until the hold clears.",
    a: { seats: row([[FOCUS_SEAT, "hold"]]) },
    b: { seats: row([[FOCUS_SEAT, "reject"]]), acting: true },
  },
  {
    title: "The hold is temporary",
    caption:
      "A hold does not last forever. It has a short timer, and it stays alive only while Bob's live connection is open.",
    a: { seats: row([[FOCUS_SEAT, "hold"]]) },
    b: { seats: row([[FOCUS_SEAT, "hold"]]) },
  },
  {
    title: "If Bob leaves, it frees up",
    caption:
      "If that timer runs out, or Bob's connection drops, the hold is released on its own and seat 4 turns green again. There is nothing to clean up.",
    a: { seats: allFree() },
    b: { seats: allFree() },  },
  {
    title: "Or Bob confirms, and it's booked",
    caption:
      "If Bob confirms instead, the hold becomes a real booking in one step, with no gap where anyone could slip in.",
    a: { seats: row([[FOCUS_SEAT, "booked"]]), acting: true },
    b: { seats: row([[FOCUS_SEAT, "booked"]]) },  },
];
