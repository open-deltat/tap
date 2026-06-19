"use server";

import { dt } from "@/lib/deltat";
import * as store from "@/lib/store";
import { addSchedule, findRootByName, baseMs } from "./seed-helpers";

const NAME = "Dr. Sarah Chen";

export async function seedAvailabilityScheduler(): Promise<string> {
  const existing = await findRootByName(NAME);
  if (existing) return existing;

  const r = await dt.resources.create({ name: NAME });
  store.set(r.id, { slotMinutes: 30, price: null });

  // Mon–Fri 09:00–17:00, expanded into rules at the edge (no kernel Schedule primitive).
  const weekday = [{ h: 9, m: 0, dur: 480 }];
  await addSchedule(r.id, baseMs(), 21, { 1: weekday, 2: weekday, 3: weekday, 4: weekday, 5: weekday });

  const base = new Date(baseMs());
  const excludeOffsets = [7, 14];
  await dt.rules.create(
    excludeOffsets.map((offset) => {
      const startMs = base.getTime() + offset * 86_400_000;
      return { resourceId: r.id, start: startMs, end: startMs + 86_400_000, blocking: true };
    })
  );

  return r.id;
}
