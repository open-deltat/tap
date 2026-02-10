"use server";

import { dt } from "@/lib/deltat";
import { expandRecurrence } from "@open-tap/client";
import * as store from "@/lib/store";
import { findRootByName, baseMs, toDateStr, seedDateRange } from "./seed-helpers";

const NAME = "Dr. Sarah Chen";

export async function seedAvailabilityScheduler(): Promise<string> {
  const existing = await findRootByName(NAME);
  if (existing) return existing;

  const r = await dt.resources.create({ name: NAME });
  store.set(r.id, { slotMinutes: 30, price: null });

  const { fromDate, toDate } = seedDateRange(60);
  const base = new Date(baseMs());

  const segments = expandRecurrence({
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: "09:00",
    endTime: "17:00",
    fromDate,
    toDate,
    blocking: false,
    excludeDates: [
      toDateStr(new Date(base.getTime() + 7 * 86_400_000)),
      toDateStr(new Date(base.getTime() + 14 * 86_400_000)),
    ],
  });

  if (segments.length > 0) {
    await dt.rules.create(
      segments.map((s) => ({
        resourceId: r.id,
        start: s.start,
        end: s.end,
        blocking: s.blocking,
      }))
    );
  }

  return r.id;
}
