"use server";

import { dt } from "../../lib/deltat";
import * as store from "../../lib/store";
import { ensureSchedule, findRootByName, baseMs, type DaySchedule } from "../../actions/seed-helpers";

const NAME = "Dr. Sarah Chen";

// Mon–Fri 09:00–17:00, expanded into rules at the edge (no kernel Schedule primitive).
const WEEKDAY = [{ h: 9, m: 0, dur: 480 }];
const OFFICE_HOURS: DaySchedule = { 1: WEEKDAY, 2: WEEKDAY, 3: WEEKDAY, 4: WEEKDAY, 5: WEEKDAY };

export async function seedAvailabilityScheduler(): Promise<string> {
  const existing = await findRootByName(NAME);
  if (existing) {
    await ensureSchedule(existing, OFFICE_HOURS);
    return existing;
  }

  const r = await dt.resources.create({ name: NAME });
  store.set(r.id, { slotMinutes: 30, price: null });

  await ensureSchedule(r.id, OFFICE_HOURS);

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
