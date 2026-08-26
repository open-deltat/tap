"use server";

import { dt } from "../../lib/deltat";
import {
  createVenue,
  createSection,
  createSeats,
  ensureSchedule,
  daily,
  prebookSeats,
  findRootByName,
  baseMs,
} from "../../actions/seed-helpers";

const NAME = "Cineplex Odeon";

// A multiplex: one cinema, four screens. Each screen shows a different film on its OWN
// showtimes (a per-resource schedule), with its own seating, the deltat tree models this
// as Cinema → Screen → Seats, where seats inherit their screen's showtimes.
const SCREENS = [
  { film: "Dune: Part Two", firstShow: 12, price: 17 },
  { film: "Inside Out 2", firstShow: 13, price: 15 },
  { film: "The Batman", firstShow: 14, price: 15 },
  { film: "Oppenheimer", firstShow: 18, price: 16 },
];

const RUNTIME = 150; // minutes

// The cinema is open 08:00–01:00; each screen runs two staggered showtimes inside that.
const HOUSE_HOURS = daily([{ h: 8, m: 0, dur: 1020 }]);
const showtimes = (firstShow: number) =>
  daily([
    { h: firstShow, m: 0, dur: RUNTIME },
    { h: firstShow + 4, m: 0, dur: RUNTIME },
  ]);

// Returns the SCREEN ids (not the cinema root): each screen is its own "venue" in the seat
// booker, so its two showtimes become the selectable slot pills. Booking against the cinema
// root instead would use its 08:00–01:00 umbrella window, under which no seat is free for the
// whole slot, which is why every seat used to read unavailable.
export async function seedCinema(): Promise<string[]> {
  const existing = await findRootByName(NAME);
  if (existing) {
    const screens = await dt.resources.get({ parentId: existing });
    // Roof before rooms: extend the cinema's umbrella window before the screens that sit under it.
    await ensureSchedule(existing, HOUSE_HOURS);
    for (const screen of screens) {
      const def = SCREENS.find((s) => screen.name?.endsWith(s.film));
      if (def) await ensureSchedule(screen.id, showtimes(def.firstShow));
    }
    return screens.map((s) => s.id);
  }

  const base = baseMs();
  const cinema = await createVenue(NAME, { slotMinutes: RUNTIME, bufferMinutes: 30 });

  await ensureSchedule(cinema.id, HOUSE_HOURS);

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
    await ensureSchedule(screen.id, showtimes(firstShow));
    // Each screen's first showtime opens partly sold.
    await prebookSeats(seats, 6 + i * 2, base + firstShow * 3_600_000, RUNTIME, "Sold");
  }

  return screenIds;
}
