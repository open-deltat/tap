"use server";

import { dt } from "@/lib/deltat";
import { localUtcOffsetMinutes } from "@open-tap/client";
import * as store from "@/lib/store";
import { findRootByName } from "./seed-helpers";

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

  const garage = await dt.resources.create({ name: NAME });
  store.set(garage.id, { slotMinutes: 60, price: null });

  await dt.schedules.set({
    resourceId: garage.id,
    days: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
    startTime: "00:00",
    endTime: "23:59",
    utcOffsetMinutes: localUtcOffsetMinutes(),
  });

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
