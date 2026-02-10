"use server";

import { dt } from "@/lib/deltat";
import { expandRecurrence } from "@open-tap/client";
import * as store from "@/lib/store";
import { findRootByName, baseMs } from "./seed-helpers";

const NAME = "Downtown Garage";

const FLOORS = [
  {
    name: "Floor 1",
    zones: [
      { name: "A", spots: 4 },
      { name: "B", spots: 4 },
    ],
  },
  {
    name: "Floor 2",
    zones: [
      { name: "C", spots: 4 },
      { name: "D", spots: 4 },
    ],
  },
  {
    name: "Floor 3",
    zones: [
      { name: "E", spots: 4 },
      { name: "F", spots: 4 },
    ],
  },
  {
    name: "Floor 4",
    zones: [
      { name: "G", spots: 4 },
      { name: "H", spots: 4 },
    ],
  },
];

export async function seedParking(): Promise<string> {
  const existing = await findRootByName(NAME);
  if (existing) return existing;

  const base = new Date(baseMs());
  const fromDate = toDateStr(base);
  const endDate = new Date(base.getTime() + 30 * 86_400_000);
  const toDate = toDateStr(endDate);

  const garage = await dt.resources.create({ name: NAME });
  store.set(garage.id, { slotMinutes: 60, price: null });

  const segments = expandRecurrence({
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    startTime: "00:00",
    endTime: "23:59",
    fromDate,
    toDate,
    blocking: false,
  });

  if (segments.length > 0) {
    await dt.rules.create(
      segments.map((s) => ({
        resourceId: garage.id,
        start: s.start,
        end: s.end,
        blocking: false,
      }))
    );
  }

  for (const floor of FLOORS) {
    const f = await dt.resources.create({ parentId: garage.id, name: floor.name });
    store.set(f.id, { slotMinutes: 60, price: null });

    for (const zone of floor.zones) {
      const z = await dt.resources.create({ parentId: f.id, name: `Zone ${zone.name}` });
      store.set(z.id, { slotMinutes: 60, price: null });

      for (let i = 1; i <= zone.spots; i++) {
        const spot = await dt.resources.create({ parentId: z.id, name: `${zone.name}${i}` });
        store.set(spot.id, { slotMinutes: 60, price: null });
      }
    }
  }

  return garage.id;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
