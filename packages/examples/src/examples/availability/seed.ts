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

// Open hours are a rolling schedule, so the calendar has no end; a caller who scrolls past what is
// seeded asks for more. Bounded, because the action is public: two years is about 520 rules at most.
const MIN_HORIZON_DAYS = 14;
const MAX_HORIZON_DAYS = 730;

/** Lay open hours down through `days` days from today. Idempotent: it only adds what is missing. */
export async function extendAvailabilityThrough(days: number): Promise<void> {
  if (!Number.isFinite(days)) return;
  const id = await findRootByName(NAME);
  if (!id) return;
  const horizonDays = Math.min(MAX_HORIZON_DAYS, Math.max(MIN_HORIZON_DAYS, Math.floor(days)));
  await ensureSchedule(id, OFFICE_HOURS, { horizonDays });
}
