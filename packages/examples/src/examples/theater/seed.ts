"use server";

import { createVenue, createSection, createSeats, ensureSchedule, findRootByName } from "../../actions/seed-helpers";
import { BUFFER_MINUTES, NAME, SECTIONS, SHOW_MINUTES, SHOWTIMES } from "./structure";

// The sections, seats and showtimes are in ./structure, which the hosted MCP's modelling guide reads
// too; this file only builds them.

export async function seedTheater(): Promise<string[]> {
  const existing = await findRootByName(NAME);
  if (existing) {
    await ensureSchedule(existing, SHOWTIMES);
    return [existing];
  }

  const opts = (price: number) => ({ slotMinutes: SHOW_MINUTES, bufferMinutes: BUFFER_MINUTES, price });

  const ham = await createVenue(NAME, { slotMinutes: SHOW_MINUTES, bufferMinutes: BUFFER_MINUTES });

  for (const section of SECTIONS) {
    const sec = await createSection(ham.id, section.name, opts(section.price));
    await createSeats(sec.id, section.rows, section.seats, opts(section.price));
  }

  await ensureSchedule(ham.id, SHOWTIMES);

  return [ham.id];
}
