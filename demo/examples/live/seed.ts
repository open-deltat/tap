"use server";

import {
  createVenue,
  createSection,
  createSeats,
  addSchedule,
  daily,
  findRootByName,
  baseMs,
} from "@/app/actions/seed-helpers";

const NAME = "Live Cinema";
const SCREEN = "Screen 1";
const SHOW_MINUTES = 150; // one ~2.5h evening showtime

export const LIVE_ROWS = ["A", "B", "C", "D", "E", "F"] as const;
export const LIVE_COLS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/**
 * A small cinema for the realtime demo: one venue → one screen section → a 6x8 grid of
 * capacity-1 seats, with a single 19:00 showtime today. Holding or booking a seat emits a
 * deltat event the venue subscription broadcasts to every connection — which is the whole
 * point of the LISTEN/NOTIFY demo. Idempotent; returns the venue (root) id.
 */
export async function seedLive(): Promise<string> {
  const existing = await findRootByName(NAME);
  if (existing) return existing;

  const base = baseMs();
  const venue = await createVenue(NAME, { slotMinutes: SHOW_MINUTES, bufferMinutes: 0 });
  const screen = await createSection(venue.id, SCREEN, {
    slotMinutes: SHOW_MINUTES,
    bufferMinutes: 0,
    price: 0,
  });

  // One showtime today at 19:00 for SHOW_MINUTES. Seats inherit this window via the venue tree.
  await addSchedule(venue.id, base, 1, daily([{ h: 19, m: 0, dur: SHOW_MINUTES }]));

  await createSeats(screen.id, [...LIVE_ROWS], [...LIVE_COLS], {
    slotMinutes: SHOW_MINUTES,
    bufferMinutes: 0,
    price: 0,
  });

  return venue.id;
}
