"use server";

import { createVenue, createSection, createSeats, ensureSchedule, findRootByName, type DaySchedule } from "../../actions/seed-helpers";

const NAME = "Hamilton";

// The run's weekly performance grid: matinees Wed/Sat/Sun, dark on Mondays.
const SHOWTIMES: DaySchedule = {
  0: [{ h: 15, m: 0, dur: 165 }],
  2: [{ h: 19, m: 0, dur: 165 }],
  3: [{ h: 14, m: 0, dur: 165 }, { h: 19, m: 0, dur: 165 }],
  4: [{ h: 19, m: 0, dur: 165 }],
  5: [{ h: 20, m: 0, dur: 165 }],
  6: [{ h: 14, m: 0, dur: 165 }, { h: 20, m: 0, dur: 165 }],
};

export async function seedTheater(): Promise<string[]> {
  const existing = await findRootByName(NAME);
  if (existing) {
    await ensureSchedule(existing, SHOWTIMES);
    return [existing];
  }

  const hamOpts = (price: number) => ({
    slotMinutes: 165,
    bufferMinutes: 20,
    price,
  });

  const ham = await createVenue(NAME, { slotMinutes: 165, bufferMinutes: 20 });

  const orch = await createSection(ham.id, "Orchestra", hamOpts(349));
  await createSeats(orch.id, ["A", "B", "C", "D"], Array.from({ length: 10 }, (_, i) => i + 1), hamOpts(349));

  const mezz = await createSection(ham.id, "Mezzanine", hamOpts(199));
  await createSeats(mezz.id, ["E", "F"], Array.from({ length: 8 }, (_, i) => i + 1), hamOpts(199));

  const balc = await createSection(ham.id, "Balcony", hamOpts(79));
  await createSeats(balc.id, ["G", "H"], Array.from({ length: 6 }, (_, i) => i + 1), hamOpts(79));

  await ensureSchedule(ham.id, SHOWTIMES);

  return [ham.id];
}
