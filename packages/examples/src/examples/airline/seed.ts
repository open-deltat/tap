"use server";

import { createVenue, createSection, createSeats, ensureSchedule, daily, prebookSeats, findRootByName, baseMs } from "../../actions/seed-helpers";

const W_NAME = "AA-100 JFK → LAX";
const E_NAME = "AA-205 LAX → JFK";

// Two departures a day per flight, inherited by every seat.
const W_DEPARTURES = daily([
  { h: 6, m: 0, dur: 360 },
  { h: 14, m: 30, dur: 360 },
]);
const E_DEPARTURES = daily([
  { h: 8, m: 0, dur: 300 },
  { h: 16, m: 0, dur: 300 },
]);

export async function seedAirline(): Promise<string[]> {
  const wId = await findRootByName(W_NAME);
  const eId = await findRootByName(E_NAME);
  if (wId && eId) {
    await Promise.all([ensureSchedule(wId, W_DEPARTURES), ensureSchedule(eId, E_DEPARTURES)]);
    return [wId, eId];
  }

  const base = baseMs();
  const flightOpts = (dur: number, price: number) => ({
    slotMinutes: dur,
    bufferMinutes: 45,
    price,
  });

  // A wide-body layout per flight: First (2-2), Business (2-2), Economy (3-3) ≈ 150 seats,
  // so the two flights total ~300 assigned (capacity-1) seats, the scale the spec calls for.
  const ECON_ROWS = Array.from({ length: 21 }, (_, i) => 10 + i); // rows 10–30

  // AA-100 JFK → LAX (westward, 6h)
  const w = await createVenue(W_NAME, { slotMinutes: 360, bufferMinutes: 45 });

  const wFc = await createSection(w.id, "First Class", flightOpts(360, 1200));
  const wFcSeats = await createSeats(wFc.id, [1, 2], ["A", "B", "E", "F"], flightOpts(360, 1200));

  const wBiz = await createSection(w.id, "Business", flightOpts(360, 650));
  await createSeats(wBiz.id, [3, 4, 5, 6], ["A", "B", "E", "F"], flightOpts(360, 650));

  const wEcon = await createSection(w.id, "Economy", flightOpts(360, 220));
  const wEconSeats = await createSeats(wEcon.id, ECON_ROWS, ["A", "B", "C", "D", "E", "F"], flightOpts(360, 220));

  await ensureSchedule(w.id, W_DEPARTURES);

  // The 06:00 departure opens partly full: a first-class window seat and several economy seats taken.
  await prebookSeats(wFcSeats, 2, base + 6 * 3_600_000, 360, "Booked");
  await prebookSeats(wEconSeats, 28, base + 6 * 3_600_000, 360, "Booked");

  // AA-205 LAX → JFK (eastward, 5h)
  const e = await createVenue(E_NAME, { slotMinutes: 300, bufferMinutes: 45 });

  const eFc = await createSection(e.id, "First Class", flightOpts(300, 1100));
  await createSeats(eFc.id, [1, 2], ["A", "B", "E", "F"], flightOpts(300, 1100));

  const eBiz = await createSection(e.id, "Business", flightOpts(300, 580));
  await createSeats(eBiz.id, [3, 4, 5, 6], ["A", "B", "E", "F"], flightOpts(300, 580));

  const eEcon = await createSection(e.id, "Economy", flightOpts(300, 189));
  const eEconSeats = await createSeats(eEcon.id, ECON_ROWS, ["A", "B", "C", "D", "E", "F"], flightOpts(300, 189));

  await ensureSchedule(e.id, E_DEPARTURES);

  // The 08:00 departure opens lightly booked.
  await prebookSeats(eEconSeats, 14, base + 8 * 3_600_000, 300, "Booked");

  return [w.id, e.id];
}
