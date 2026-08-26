"use server";

import { createVenue, ensureSchedule, daily, findRootByName } from "./seed-helpers";

const NAME = "My Calendar";

// A generous default day, 06:00–23:00, so anything dropped onto the calendar has room to land.
const OPEN_DAY = daily([{ h: 6, m: 0, dur: 1020 }]);

export async function ensurePersonalCalendar(): Promise<string> {
  const existing = await findRootByName(NAME);
  if (existing) {
    await ensureSchedule(existing, OPEN_DAY);
    return existing;
  }

  const cal = await createVenue(NAME, { slotMinutes: 15, bufferMinutes: 0 });
  await ensureSchedule(cal.id, OPEN_DAY);
  return cal.id;
}
