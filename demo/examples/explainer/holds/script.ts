/**
 * Scripted "Holds & race conditions" chapter — no live deltat needed.
 *
 * The seat row is fixed (6 seats); each step is a pure snapshot of how those seats look
 * on each client lane plus the caption naming the deltat mechanism. The component just
 * renders the snapshot for the current step, so prev/next/scrub is trivially deterministic.
 */

export const SEAT_COUNT = 6;
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
  /** Show the ⚡ delta arrow flowing A → B between the lanes. */
  delta?: boolean;
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
      "Two people open the same screen. They both see the live seat map at once. Nobody has to refresh.",
    a: { seats: allFree() },
    b: { seats: allFree() },
  },
  {
    title: "One person holds a seat",
    caption:
      "The first person taps seat 4. deltat puts a short hold on it, so it counts as taken straight away.",
    a: { seats: row([[FOCUS_SEAT, "hold"]]), acting: true },
    b: { seats: allFree() },
  },
  {
    title: "The other person sees it",
    caption:
      "That hold is pushed to the second person right away, so seat 4 turns amber on their screen within a moment.",
    a: { seats: row([[FOCUS_SEAT, "hold"]]) },
    b: { seats: row([[FOCUS_SEAT, "hold"]]) },
    delta: true,
  },
  {
    title: "They both grab it",
    caption:
      "The second person taps seat 4 at the same time. deltat says no. The first hold wins, the second is turned away, and the seat is never given to two people.",
    a: { seats: row([[FOCUS_SEAT, "hold"]]) },
    b: { seats: row([[FOCUS_SEAT, "reject"]]), acting: true },
  },
  {
    title: "The hold becomes a booking",
    caption:
      "The first person confirms. The hold turns into a real booking in one step, with no gap where someone else could slip in.",
    a: { seats: row([[FOCUS_SEAT, "booked"]]), acting: true },
    b: { seats: row([[FOCUS_SEAT, "booked"]]) },
    delta: true,
  },
  {
    title: "Or the hold expires",
    caption:
      "If the first person had wandered off instead, the hold runs out on its own and the seat goes back to free. Nothing to clean up.",
    a: { seats: allFree() },
    b: { seats: allFree() },
    delta: true,
  },
];

export const HOLDS_STEP_COUNT = HOLDS_STEPS.length;
