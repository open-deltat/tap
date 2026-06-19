import type { Booking } from "@/lib/schemas";

const DAY = 86_400_000;

/** A night, keyed by its 00:00 local timestamp, with how many rooms are taken. */
export interface NightOccupancy {
  date: Date;
  taken: number;
}

/** Normalize a timestamp to local midnight (the night it belongs to). */
function nightStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Expand each booking's half-open [check-in, check-out) range into the nights it covers and
 * tally how many rooms are taken per night. The night a stay checks out is NOT occupied.
 */
export function occupancyByNight(bookings: Booking[]): Map<number, NightOccupancy> {
  const nights = new Map<number, NightOccupancy>();
  for (const b of bookings) {
    const last = nightStart(b.end - 1); // exclusive checkout: last occupied night
    for (let t = nightStart(b.start); t <= last; t += DAY) {
      const existing = nights.get(t);
      if (existing) existing.taken += 1;
      else nights.set(t, { date: new Date(t), taken: 1 });
    }
  }
  return nights;
}

/** Split occupied nights into fully-booked vs partially-booked, given the room-type capacity. */
export function bookedNightSets(
  bookings: Booking[],
  capacity: number
): { full: Date[]; partial: Date[] } {
  const full: Date[] = [];
  const partial: Date[] = [];
  for (const { date, taken } of occupancyByNight(bookings).values()) {
    if (taken >= capacity) full.push(date);
    else partial.push(date);
  }
  return { full, partial };
}
