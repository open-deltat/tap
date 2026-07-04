"use server";

import { dt } from "../../lib/deltat";
import * as store from "../../lib/store";
import { addSchedule, daily, findRootByName, baseMs } from "../../actions/seed-helpers";

const NAME = "Bella Cucina";

// The dining table closed for tonight's service, to demo "block a table tonight".
const BLOCKED_TABLE = "D1";
const BAR_SECTION = "Bar";
const BAR_NAME = "Bar";
const BAR_CAPACITY = 10;
const BAR_PRICE = 0;

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

  const restaurant = await dt.resources.create({ name: NAME, bufferAfter: 30 * 60_000 });
  store.set(restaurant.id, { slotMinutes: 90, price: null });

  // Open 11:00–22:00 daily, expanded into rules at the edge (no kernel Schedule primitive).
  await addSchedule(restaurant.id, baseMs(), 30, daily([{ h: 11, m: 0, dur: 660 }]));

  let blockedTableId: string | null = null;

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
      if (table.name === BLOCKED_TABLE) blockedTableId = t.id;
    }
  }

  // The Bar: ONE capacity-N resource. A party books K of N walk-up seats in one atomic batch;
  // the engine allows up to N and rejects the (N+1)th seat.
  const barSection = await dt.resources.create({ parentId: restaurant.id, name: BAR_SECTION });
  store.set(barSection.id, { slotMinutes: 90, price: null });
  const bar = await dt.resources.create({
    parentId: barSection.id,
    name: BAR_NAME,
    capacity: BAR_CAPACITY,
    bufferAfter: 30 * 60_000,
  });
  store.set(bar.id, { slotMinutes: 90, price: BAR_PRICE });

  // Block one dining table for tonight's dinner service (19:00–22:00 today).
  if (blockedTableId) {
    const base = baseMs();
    const start = base + 19 * 3_600_000;
    const end = base + 22 * 3_600_000;
    await dt.rules.create([{ resourceId: blockedTableId, start, end, blocking: true }]);
  }

  return restaurant.id;
}
