"use server";

import { dt } from "@/lib/deltat";
import * as store from "@/lib/store";
import { createVenue, createSeats, addSchedule, daily, findRootByName, baseMs } from "./seed-helpers";

const NAME = "Live Room";
const SLOT = 1440; // one always-open all-day slot

export const LIVE_ROWS = ["A", "B", "C", "D", "E"] as const;
export const LIVE_COLS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/**
 * A cinema-shaped 5x8 grid of capacity-1 seats under one root, open all day today. Booking any
 * seat emits a deltat BookingConfirmed event the venue subscription broadcasts to every client —
 * which is the whole point of the realtime demo. Returns the venue (root) id.
 */
export async function seedLive(): Promise<string> {
  const existing = await findRootByName(NAME);
  if (existing) return existing;

  const base = baseMs();
  const venue = await createVenue(NAME, { slotMinutes: SLOT, bufferMinutes: 0 });

  // Always open today (00:00 + 1440 min). Seats inherit this window.
  await addSchedule(venue.id, base, 1, daily([{ h: 0, m: 0, dur: SLOT }]));

  await createSeats(venue.id, [...LIVE_ROWS], [...LIVE_COLS], {
    slotMinutes: SLOT,
    bufferMinutes: 0,
    price: 0,
  });

  store.set(venue.id, { slotMinutes: SLOT, price: null });
  return venue.id;
}
