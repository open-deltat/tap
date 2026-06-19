"use server";

import { dt } from "@/lib/deltat";
import { createVenue, addSchedule, daily, findRootByName, baseMs } from "./seed-helpers";

const H = 3_600_000;

async function ensurePerson(
  name: string,
  busy: { startH: number; durH: number }[]
): Promise<string> {
  const existing = await findRootByName(name);
  if (existing) return existing;

  const cal = await createVenue(name, { slotMinutes: 30, bufferMinutes: 0 });
  // Open hours 09:00–17:00, daily for two weeks — recurrence expanded into Rules at the edge.
  await addSchedule(cal.id, baseMs(), 14, daily([{ h: 9, m: 0, dur: 480 }]));
  // Today's busy blocks, so the two calendars genuinely differ.
  const today = baseMs();
  for (const b of busy) {
    const start = today + b.startH * H;
    await dt.bookings.create([
      { resourceId: cal.id, start, end: start + b.durH * H, label: `${name} — busy` },
    ]);
  }
  return cal.id;
}

export async function ensureMeetCalendars(): Promise<{ aliceId: string; bobId: string }> {
  // Alice busy 09–11 & 14–15; Bob busy 10–12 & 16–17. Both free today → 12–14 and 15–16.
  const aliceId = await ensurePerson("Alice", [{ startH: 9, durH: 2 }, { startH: 14, durH: 1 }]);
  const bobId = await ensurePerson("Bob", [{ startH: 10, durH: 2 }, { startH: 16, durH: 1 }]);
  return { aliceId, bobId };
}
