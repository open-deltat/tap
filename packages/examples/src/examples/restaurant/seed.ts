"use server";

import { dt } from "../../lib/deltat";
import * as store from "../../lib/store";
import { ensureSchedule, findRootByName, baseMs } from "../../actions/seed-helpers";
import { BAR, BLOCKED_TABLE, NAME, SEATING_MINUTES, SECTIONS, SERVICE_HOURS, TURNOVER_MINUTES } from "./structure";

// The shape (sections, tables, bar, hours) is in ./structure, which the hosted MCP's modelling
// guide reads too; this file only builds it.

const TURNOVER_MS = TURNOVER_MINUTES * 60_000;

export async function seedRestaurant(): Promise<string> {
  const existing = await findRootByName(NAME);
  if (existing) {
    await ensureSchedule(existing, SERVICE_HOURS);
    return existing;
  }

  const restaurant = await dt.resources.create({ name: NAME, bufferAfter: TURNOVER_MS });
  store.set(restaurant.id, { slotMinutes: SEATING_MINUTES, price: null });

  await ensureSchedule(restaurant.id, SERVICE_HOURS);

  let blockedTableId: string | null = null;

  for (const section of SECTIONS) {
    const sec = await dt.resources.create({ parentId: restaurant.id, name: section.name });
    store.set(sec.id, { slotMinutes: SEATING_MINUTES, price: null });

    for (const table of section.tables) {
      const t = await dt.resources.create({
        parentId: sec.id,
        name: table.name,
        bufferAfter: TURNOVER_MS,
      });
      store.set(t.id, { slotMinutes: SEATING_MINUTES, price: null, maxGuests: table.maxGuests });
      if (table.name === BLOCKED_TABLE) blockedTableId = t.id;
    }
  }

  // The Bar: ONE capacity-N resource. A party books K of N walk-up seats in one atomic batch;
  // the engine allows up to N and rejects the (N+1)th seat.
  const barSection = await dt.resources.create({ parentId: restaurant.id, name: BAR.section });
  store.set(barSection.id, { slotMinutes: SEATING_MINUTES, price: null });
  const bar = await dt.resources.create({
    parentId: barSection.id,
    name: BAR.name,
    capacity: BAR.capacity,
    bufferAfter: TURNOVER_MS,
  });
  store.set(bar.id, { slotMinutes: SEATING_MINUTES, price: BAR.price });

  // Block one dining table for tonight's dinner service (19:00–22:00 today).
  if (blockedTableId) {
    const base = baseMs();
    const start = base + 19 * 3_600_000;
    const end = base + 22 * 3_600_000;
    await dt.rules.create([{ resourceId: blockedTableId, start, end, blocking: true }]);
  }

  return restaurant.id;
}
