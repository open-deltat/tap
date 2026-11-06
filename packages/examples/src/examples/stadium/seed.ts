"use server";

import { dt } from "../../lib/deltat";
import * as store from "../../lib/store";
import type { SectionLayout } from "../../lib/schemas";
import { ensureSchedule, findRootByName } from "../../actions/seed-helpers";
import { EVENT_DAYS, EVENT_DUR, NAME, TIERS } from "./structure";

// The tiers and sections are in ./structure, which the hosted MCP's modelling guide reads too; this
// file only builds them.

export async function seedStadium(): Promise<string[]> {
  const existing = await findRootByName(NAME);
  if (existing) {
    await ensureSchedule(existing, EVENT_DAYS);
    return [existing];
  }

  const stadium = await dt.resources.create({ name: NAME });
  store.set(stadium.id, { slotMinutes: EVENT_DUR, price: null });

  await ensureSchedule(stadium.id, EVENT_DAYS);

  for (let ring = 0; ring < TIERS.length; ring++) {
    const tier = TIERS[ring];
    const tierRes = await dt.resources.create({ parentId: stadium.id, name: tier.name });
    store.set(tierRes.id, { slotMinutes: EVENT_DUR, price: tier.price });

    for (let idx = 0; idx < tier.sections; idx++) {
      const label = tier.assigned ? `Box ${idx + 1}` : `Sec ${ring + 1}${String(idx + 1).padStart(2, "0")}`;
      const section: SectionLayout = {
        tier: tier.name,
        ring,
        idx,
        ringCount: tier.sections,
        assigned: tier.assigned,
      };
      const r = await dt.resources.create({
        parentId: tierRes.id,
        name: label,
        capacity: tier.capacity,
      });
      store.set(r.id, { slotMinutes: EVENT_DUR, price: tier.price, section });
    }
  }

  return [stadium.id];
}
