"use server";

import { dt } from "@/lib/deltat";
import { expandRecurrence } from "@open-tap/client";
import * as store from "@/lib/store";
import { findRootByName, seedDateRange } from "./seed-helpers";

const NAME = "Bella Cucina";

interface TableDef {
  name: string;
  maxGuests: number;
}

const SECTIONS: { name: string; tables: TableDef[] }[] = [
  {
    name: "Patio",
    tables: [
      { name: "P1", maxGuests: 2 },
      { name: "P2", maxGuests: 2 },
      { name: "P3", maxGuests: 4 },
      { name: "P4", maxGuests: 4 },
    ],
  },
  {
    name: "Dining Room",
    tables: [
      { name: "D1", maxGuests: 2 },
      { name: "D2", maxGuests: 4 },
      { name: "D3", maxGuests: 4 },
      { name: "D4", maxGuests: 6 },
      { name: "D5", maxGuests: 6 },
      { name: "D6", maxGuests: 8 },
    ],
  },
  {
    name: "Private Room",
    tables: [
      { name: "VIP1", maxGuests: 8 },
      { name: "VIP2", maxGuests: 12 },
    ],
  },
];

export async function seedRestaurant(): Promise<string> {
  const existing = await findRootByName(NAME);
  if (existing) return existing;

  const { fromDate, toDate } = seedDateRange(30);

  const restaurant = await dt.resources.create({ name: NAME, bufferAfter: 30 * 60_000 });
  store.set(restaurant.id, { slotMinutes: 90, price: null });

  const segments = expandRecurrence({
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    startTime: "11:00",
    endTime: "22:00",
    fromDate,
    toDate,
    blocking: false,
  });

  if (segments.length > 0) {
    await dt.rules.create(
      segments.map((s) => ({
        resourceId: restaurant.id,
        start: s.start,
        end: s.end,
        blocking: false,
      }))
    );
  }

  for (const section of SECTIONS) {
    const sec = await dt.resources.create({ parentId: restaurant.id, name: section.name });
    store.set(sec.id, { slotMinutes: 90, price: null });

    for (const table of section.tables) {
      const t = await dt.resources.create({
        parentId: sec.id,
        name: table.name,
        bufferAfter: 30 * 60_000,
      });
      store.set(t.id, { slotMinutes: 90, price: null, maxGuests: table.maxGuests });
    }
  }

  return restaurant.id;
}
