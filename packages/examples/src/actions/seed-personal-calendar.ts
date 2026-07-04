"use server";

import { createVenue, addSchedule, daily, findRootByName, baseMs } from "./seed-helpers";

const NAME = "My Calendar";

export async function ensurePersonalCalendar(): Promise<string> {
  const existing = await findRootByName(NAME);
  if (existing) return existing;

  const cal = await createVenue(NAME, { slotMinutes: 15, bufferMinutes: 0 });

  await addSchedule(cal.id, baseMs(), 30, daily([
    { h: 6, m: 0, dur: 1020 },
  ]));

  return cal.id;
}
