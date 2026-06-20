"use server";

import { dt } from "@/lib/deltat";
import * as store from "@/lib/store";
import type { SectionLayout } from "@/lib/schemas";
import { addSchedule, daily, findRootByName, baseMs } from "@/app/actions/seed-helpers";

const NAME = "Olympia Stadium";
const EVENT_DUR = 210; // minutes

// Concentric oval tiers. Each "section" is ONE resource:
//   - pool tiers  → capacity-N  (general admission: book K of N — fungible)
//   - premium     → capacity-1  (a box you reserve outright — assigned)
// Capacities sum to ~80,000 across ~92 sections — a stadium as a handful of capacity numbers,
// not 80,000 individual seat rows.
const TIERS: {
  name: string;
  sections: number;
  capacity: number;
  price: number;
  assigned: boolean;
}[] = [
  { name: "Lower Bowl", sections: 30, capacity: 1400, price: 150, assigned: false },
  { name: "Club Level", sections: 20, capacity: 600, price: 350, assigned: false },
  { name: "Upper Deck", sections: 34, capacity: 750, price: 65, assigned: false },
  { name: "Premium Boxes", sections: 8, capacity: 1, price: 1200, assigned: true },
];

export async function seedStadium(): Promise<string[]> {
  const existing = await findRootByName(NAME);
  if (existing) return [existing];

  const base = baseMs();
  const stadium = await dt.resources.create({ name: NAME });
  store.set(stadium.id, { slotMinutes: EVENT_DUR, price: null });

  // Two events a day, inherited by every section.
  await addSchedule(
    stadium.id,
    base,
    30,
    daily([
      { h: 13, m: 0, dur: EVENT_DUR },
      { h: 19, m: 0, dur: EVENT_DUR },
    ])
  );

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
