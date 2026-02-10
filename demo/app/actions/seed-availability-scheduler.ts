"use server";

import { dt } from "@/lib/deltat";
import { localUtcOffsetMinutes } from "@open-tap/client";
import * as store from "@/lib/store";
import { findRootByName, baseMs } from "./seed-helpers";

const NAME = "Dr. Sarah Chen";

export async function seedAvailabilityScheduler(): Promise<string> {
  const existing = await findRootByName(NAME);
  if (existing) return existing;

  const r = await dt.resources.create({ name: NAME });
  store.set(r.id, { slotMinutes: 30, price: null });

  await dt.schedules.set({
    resourceId: r.id,
    days: ["mon", "tue", "wed", "thu", "fri"],
    startTime: "09:00",
    endTime: "17:00",
    utcOffsetMinutes: localUtcOffsetMinutes(),
  });

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
