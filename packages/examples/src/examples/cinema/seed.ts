"use server";

import { dt } from "../../lib/deltat";
import { createVenue, createSection, createSeats, ensureSchedule, prebookSeats, findRootByName, baseMs } from "../../actions/seed-helpers";
import { BUFFER_MINUTES, HOUSE_HOURS, NAME, RUNTIME, SCREENS, SEAT_NUMBERS, SEAT_ROWS, showtimes } from "./structure";

// The screens, seating and showtimes are in ./structure, which the hosted MCP's modelling guide
// reads too; this file only builds them.

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
  const cinema = await createVenue(NAME, { slotMinutes: RUNTIME, bufferMinutes: BUFFER_MINUTES });

  await ensureSchedule(cinema.id, HOUSE_HOURS);

  const screenIds: string[] = [];
  for (let i = 0; i < SCREENS.length; i++) {
    const { film, firstShow, price } = SCREENS[i];
    const screen = await createSection(cinema.id, `Screen ${i + 1} · ${film}`, {
      slotMinutes: RUNTIME,
      bufferMinutes: BUFFER_MINUTES,
      price,
    });
    screenIds.push(screen.id);
    const seats = await createSeats(screen.id, SEAT_ROWS, SEAT_NUMBERS, { slotMinutes: RUNTIME, bufferMinutes: BUFFER_MINUTES, price });
    await ensureSchedule(screen.id, showtimes(firstShow));
    // Each screen's first showtime opens partly sold.
    await prebookSeats(seats, 6 + i * 2, base + firstShow * 3_600_000, RUNTIME, "Sold");
  }

  return screenIds;
}
