"use server";

import { dt } from "@/lib/deltat";
import { expandRecurrence } from "@open-tap/client";
import * as store from "@/lib/store";
import { findRootByName, baseMs } from "./seed-helpers";

const NAME = "Dr. Sarah Chen";

export async function seedAvailabilityScheduler(): Promise<string> {
  const existing = await findRootByName(NAME);
  if (existing) return existing;

  const r = await dt.resources.create({ name: NAME });
  store.set(r.id, { slotMinutes: 30, price: null });

  const base = new Date(baseMs());
  const fromDate = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
  const endDate = new Date(base.getTime() + 60 * 86_400_000);
  const toDate = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;

  const segments = expandRecurrence({
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: "09:00",
    endTime: "17:00",
    fromDate,
    toDate,
    blocking: false,
    excludeDates: [
      // Block a couple of dates for demo
      toDateString(new Date(base.getTime() + 7 * 86_400_000)),
      toDateString(new Date(base.getTime() + 14 * 86_400_000)),
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

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
