"use server";

import { createVenue, createSection, createSeats, ensureSchedule, prebookSeats, findRootByName, baseMs } from "../../actions/seed-helpers";
import type { Resource } from "../../lib/schemas";
import { FLIGHTS, TURNAROUND_MINUTES } from "./structure";

// The flights, cabins, seats and departures are in ./structure, which the hosted MCP's modelling
// guide reads too; this file only builds them. Two flights of about 150 assigned (capacity-1) seats
// each, the scale the spec calls for.

export async function seedAirline(): Promise<string[]> {
  const found = await Promise.all(FLIGHTS.map((f) => findRootByName(f.name)));
  const existing = found.filter((id): id is string => id !== null);
  if (existing.length === FLIGHTS.length) {
    await Promise.all(FLIGHTS.map((f, i) => ensureSchedule(existing[i], f.departures)));
    return existing;
  }

  const base = baseMs();
  const ids: string[] = [];
  for (const flight of FLIGHTS) {
    const opts = (price: number) => ({ slotMinutes: flight.durationMinutes, bufferMinutes: TURNAROUND_MINUTES, price });
    const venue = await createVenue(flight.name, { slotMinutes: flight.durationMinutes, bufferMinutes: TURNAROUND_MINUTES });

    const seatsByCabin = new Map<string, Resource[]>();
    for (const cabin of flight.cabins) {
      const section = await createSection(venue.id, cabin.name, opts(cabin.price));
      seatsByCabin.set(cabin.name, await createSeats(section.id, cabin.rows, cabin.seats, opts(cabin.price)));
    }

    await ensureSchedule(venue.id, flight.departures);

    for (const p of flight.prebooked) {
      await prebookSeats(seatsByCabin.get(p.cabin) ?? [], p.count, base + p.hour * 3_600_000, flight.durationMinutes, "Booked");
    }
    ids.push(venue.id);
  }

  return ids;
}
