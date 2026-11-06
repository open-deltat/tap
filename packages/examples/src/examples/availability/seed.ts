"use server";

import { dt } from "../../lib/deltat";
import * as store from "../../lib/store";
import { ensureSchedule, findRootByName, baseMs } from "../../actions/seed-helpers";
import { DAYS_OFF, NAME, OFFICE_HOURS, SLOT_MINUTES } from "./structure";

// The hours, slot length and days off are in ./structure, which the hosted MCP's modelling guide
// reads too; this file only builds them.

export async function seedAvailabilityScheduler(): Promise<string> {
  const existing = await findRootByName(NAME);
  if (existing) {
    await ensureSchedule(existing, OFFICE_HOURS);
    return existing;
  }

  const r = await dt.resources.create({ name: NAME });
  store.set(r.id, { slotMinutes: SLOT_MINUTES, price: null });

  await ensureSchedule(r.id, OFFICE_HOURS);

  const base = new Date(baseMs());
  await dt.rules.create(
    DAYS_OFF.map((offset) => {
      const startMs = base.getTime() + offset * 86_400_000;
      return { resourceId: r.id, start: startMs, end: startMs + 86_400_000, blocking: true };
    })
  );

  return r.id;
}
