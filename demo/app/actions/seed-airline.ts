"use server";

import { createVenue, createSection, createSeats, addSchedule, daily, findRootByName, baseMs } from "./seed-helpers";

const W_NAME = "AA-100 JFK → LAX";
const E_NAME = "AA-205 LAX → JFK";

export async function seedAirline(): Promise<string[]> {
  const wId = await findRootByName(W_NAME);
  const eId = await findRootByName(E_NAME);
  if (wId && eId) return [wId, eId];

  const base = baseMs();
  const flightOpts = (dur: number, price: number) => ({
    slotMinutes: dur,
    bufferMinutes: 45,
    price,
  });

  // AA-100 JFK → LAX (westward, 6h)
  const w = await createVenue(W_NAME, { slotMinutes: 360, bufferMinutes: 45 });

  const wFc = await createSection(w.id, "First Class", flightOpts(360, 1200));
  await createSeats(wFc.id, [1], ["A", "B"], flightOpts(360, 1200));

  const wBiz = await createSection(w.id, "Business", flightOpts(360, 650));
  await createSeats(wBiz.id, [2, 3], ["A", "B", "C", "D"], flightOpts(360, 650));

  const wEcon = await createSection(w.id, "Economy", flightOpts(360, 220));
  await createSeats(wEcon.id, [4, 5, 6, 7, 8], ["A", "B", "C", "D", "E", "F"], flightOpts(360, 220));

  await addSchedule(w.id, base, 14, daily([
    { h: 6, m: 0, dur: 360 },
    { h: 14, m: 30, dur: 360 },
  ]));

  // AA-205 LAX → JFK (eastward, 5h)
  const e = await createVenue(E_NAME, { slotMinutes: 300, bufferMinutes: 45 });

  const eFc = await createSection(e.id, "First Class", flightOpts(300, 1100));
  await createSeats(eFc.id, [1], ["A", "B"], flightOpts(300, 1100));

  const eBiz = await createSection(e.id, "Business", flightOpts(300, 580));
  await createSeats(eBiz.id, [2, 3], ["A", "B", "C", "D"], flightOpts(300, 580));

  const eEcon = await createSection(e.id, "Economy", flightOpts(300, 189));
  await createSeats(eEcon.id, [4, 5, 6, 7, 8], ["A", "B", "C", "D", "E", "F"], flightOpts(300, 189));

  await addSchedule(e.id, base, 14, daily([
    { h: 8, m: 0, dur: 300 },
    { h: 16, m: 0, dur: 300 },
  ]));

  return [w.id, e.id];
}
