import type { Booking } from "@/lib/schemas";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
export const AXIS_START_HOUR = 8; // 1h before open
export const AXIS_END_HOUR = 18; // 1h after close

export interface Span {
  start: number;
  end: number;
}

/** One person's day, as deltat sees it: open hours, the rules and bookings that subtract from them,
 * and the net free time deltat works out (dt.availability.get). */
export interface PersonData {
  name: string;
  open: Span[];
  blocking: Span[];
  bookings: Booking[];
  net: Span[];
}

/** Clamp a span list to the visible day window [start, end). */
export function clampSpans(spans: Span[], start: number, end: number): Span[] {
  return spans
    .map((s) => ({ start: Math.max(s.start, start), end: Math.min(s.end, end) }))
    .filter((s) => s.end > s.start);
}
