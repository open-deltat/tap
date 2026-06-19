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

/** A run of consecutive nights where at least one stable room is free the whole time. */
export interface StableOpening {
  start: number; // local-midnight ms of the first open night
  nights: number; // length of the open run
}

/**
 * SYNC-01 in the UI: find runs of `>= minNights` consecutive nights where occupancy stays below
 * capacity — i.e. a guest can book the WHOLE run on a single stable room without switching. This
 * is just the per-night occupancy from the capacity sweep, scanned for long-enough open runs;
 * deltat already guarantees a booking that fits such a run lands on one room.
 */
export function stableOpenings(
  bookings: Booking[],
  capacity: number,
  minNights: number,
  fromMs: number,
  horizonNights: number
): StableOpening[] {
  const occ = occupancyByNight(bookings);
  const openings: StableOpening[] = [];
  const cursor = new Date(fromMs);
  cursor.setHours(0, 0, 0, 0);
  let runStart: number | null = null;
  let runLen = 0;
  const flush = () => {
    if (runStart !== null && runLen >= minNights) openings.push({ start: runStart, nights: runLen });
    runStart = null;
    runLen = 0;
  };
  for (let i = 0; i < horizonNights; i++) {
    const taken = occ.get(cursor.getTime())?.taken ?? 0;
    if (taken < capacity) {
      if (runStart === null) runStart = cursor.getTime();
      runLen += 1;
    } else {
      flush();
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  flush();
  return openings;
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
