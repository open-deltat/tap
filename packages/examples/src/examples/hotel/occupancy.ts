import type { Booking } from "../../lib/schemas";

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
 * Tally rooms taken per NIGHT. A stay [check-in, check-out) sleeps the nights of its check-in day
 * through the day before check-out, independent of the actual check-in/out clock times (3 PM /
 * 11 AM), because we key by the check-in DATE and stop before the check-out date. So the nights
 * occupied are [date(check-in) .. date(check-out)), and the checkout morning never consumes a night.
 * (Date-cursor iteration, so it's DST-safe.)
 */
export function occupancyByNight(bookings: Booking[]): Map<number, NightOccupancy> {
  const nights = new Map<number, NightOccupancy>();
  for (const b of bookings) {
    const endNight = nightStart(b.end); // check-out date, NOT slept
    const cursor = new Date(nightStart(b.start));
    while (cursor.getTime() < endNight) {
      const t = cursor.getTime();
      const existing = nights.get(t);
      if (existing) existing.taken += 1;
      else nights.set(t, { date: new Date(t), taken: 1 });
      cursor.setDate(cursor.getDate() + 1);
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
 * capacity, i.e. a guest can book the WHOLE run on a single stable room without switching. This
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
