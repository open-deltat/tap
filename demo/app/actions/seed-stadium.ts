"use server";

import { createVenue, createSection, createSeats, addSchedule, daily, findRootByName, baseMs } from "./seed-helpers";

const NAME = "MetLife Stadium";

export async function seedStadium(): Promise<string[]> {
  const existing = await findRootByName(NAME);
  if (existing) return [existing];

  const base = baseMs();
  const metOpts = (price: number) => ({
    slotMinutes: 210,
    bufferMinutes: 45,
    price,
  });

  const met = await createVenue(NAME, { slotMinutes: 210, bufferMinutes: 45 });

  const floor = await createSection(met.id, "Floor", metOpts(450));
  await createSeats(floor.id, [1, 2], ["A", "B", "C", "D", "E", "F", "G", "H"], metOpts(450));

  const lower = await createSection(met.id, "Lower Bowl", metOpts(175));
  await createSeats(lower.id, [1, 2, 3], ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K"], metOpts(175));

  const upper = await createSection(met.id, "Upper Bowl", metOpts(65));
  await createSeats(upper.id, [1, 2, 3], ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M"], metOpts(65));

  await addSchedule(met.id, base, 30, daily([
    { h: 13, m: 0, dur: 210 },
    { h: 19, m: 0, dur: 210 },
  ]));

  return [met.id];
}
