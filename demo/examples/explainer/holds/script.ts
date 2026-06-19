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
    title: "Streamed, not polled",
    caption:
      "Both clients see the same free seats — streamed over LISTEN/NOTIFY, not polled. No refresh, no stale view.",
    a: { seats: allFree() },
    b: { seats: allFree() },
  },
  {
    title: "Client A holds seat 4",
    caption:
      "Client A selects seat 4 → deltat places a HOLD: a short-TTL reservation that subtracts from availability immediately.",
    a: { seats: row([[FOCUS_SEAT, "hold"]]), acting: true },
    b: { seats: allFree() },
  },
  {
    title: "Hold broadcast as a delta",
    caption:
      "The hold is broadcast as a delta — Client B sees seat 4 go amber within a moment, no poll required.",
    a: { seats: row([[FOCUS_SEAT, "hold"]]) },
    b: { seats: row([[FOCUS_SEAT, "hold"]]) },
    delta: true,
  },
  {
    title: "Race → first hold wins",
    caption:
      "Race: Client B taps seat 4 at the same moment → rejected. First hold wins; the engine refuses the second. No double-booking.",
    a: { seats: row([[FOCUS_SEAT, "hold"]]) },
    b: { seats: row([[FOCUS_SEAT, "reject"]]), acting: true },
  },
  {
    title: "Hold → booking, atomically",
    caption:
      "Client A confirms → the hold becomes a booking, atomically. One state transition, no window where the seat is double-claimable.",
    a: { seats: row([[FOCUS_SEAT, "booked"]]), acting: true },
    b: { seats: row([[FOCUS_SEAT, "booked"]]) },
    delta: true,
  },
  {
    title: "TTL expiry frees the seat",
    caption:
      "If A had walked away, the hold's TTL expires and the seat frees itself — no orphaned locks, no manual cleanup.",
    a: { seats: allFree() },
    b: { seats: allFree() },
    delta: true,
  },
];

export const HOLDS_STEP_COUNT = HOLDS_STEPS.length;
