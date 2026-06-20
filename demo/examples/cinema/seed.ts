"use server";

import { dt } from "@/lib/deltat";
import {
  createVenue,
  createSection,
  createSeats,
  addSchedule,
  daily,
  prebookSeats,
  findRootByName,
  baseMs,
} from "@/app/actions/seed-helpers";

const NAME = "Cineplex Odeon";

// A multiplex: one cinema, four screens. Each screen shows a different film on its OWN
// showtimes (a per-resource schedule), with its own seating — the deltat tree models this
// as Cinema → Screen → Seats, where seats inherit their screen's showtimes.
const SCREENS = [
  { film: "Dune: Part Two", firstShow: 12, price: 17 },
  { film: "Inside Out 2", firstShow: 13, price: 15 },
  { film: "The Batman", firstShow: 14, price: 15 },
  { film: "Oppenheimer", firstShow: 18, price: 16 },
];

const RUNTIME = 150; // minutes

// Returns the SCREEN ids (not the cinema root): each screen is its own "venue" in the seat
// booker, so its two showtimes become the selectable slot pills. Booking against the cinema
// root instead would use its 08:00–01:00 umbrella window, under which no seat is free for the
// whole slot — which is why every seat used to read unavailable.
export async function seedCinema(): Promise<string[]> {
  const existing = await findRootByName(NAME);
  if (existing) {
    const screens = await dt.resources.get({ parentId: existing });
    return screens.map((s) => s.id);
  }

  const base = baseMs();
  const cinema = await createVenue(NAME, { slotMinutes: RUNTIME, bufferMinutes: 30 });

  // The cinema is open 08:00–01:00. deltat requires a child's rules to be covered by the
  // parent's availability, so each screen's showtimes must nest inside this window.
  await addSchedule(cinema.id, base, 14, daily([{ h: 8, m: 0, dur: 1020 }]));

  const screenIds: string[] = [];
  for (let i = 0; i < SCREENS.length; i++) {
    const { film, firstShow, price } = SCREENS[i];
    const screen = await createSection(cinema.id, `Screen ${i + 1} · ${film}`, {
      slotMinutes: RUNTIME,
      bufferMinutes: 30,
      price,
    });
    screenIds.push(screen.id);
    const seats = await createSeats(
      screen.id,
      ["A", "B", "C", "D", "E"],
      [1, 2, 3, 4, 5, 6, 7, 8],
      { slotMinutes: RUNTIME, bufferMinutes: 30, price }
    );
    // Two showtimes a day, staggered per screen.
    await addSchedule(
      screen.id,
      base,
      14,
      daily([
        { h: firstShow, m: 0, dur: RUNTIME },
        { h: firstShow + 4, m: 0, dur: RUNTIME },
      ])
    );
    // Each screen's first showtime opens partly sold.
    await prebookSeats(seats, 6 + i * 2, base + firstShow * 3_600_000, RUNTIME, "Sold");
  }

  return screenIds;
}
