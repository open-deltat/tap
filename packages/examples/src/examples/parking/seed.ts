"use server";

import { dt } from "../../lib/deltat";
import * as store from "../../lib/store";
import { ensureSchedule, findRootByName, baseMs } from "../../actions/seed-helpers";
import { ALWAYS_OPEN, FLOORS, MAINTENANCE_ZONE, NAME, SLOT_MINUTES } from "./structure";

// The floors and zones are in ./structure, which the hosted MCP's modelling guide reads too; this
// file only builds them.

export async function seedParking(): Promise<string[]> {
  const existing = await findRootByName(NAME);
  if (existing) {
    await ensureSchedule(existing, ALWAYS_OPEN);
    return [existing];
  }

  const base = baseMs();
  const garage = await dt.resources.create({ name: NAME });
  store.set(garage.id, { slotMinutes: SLOT_MINUTES, price: null });

  await ensureSchedule(garage.id, ALWAYS_OPEN);

  let maintenanceZoneId: string | null = null;

  for (const floor of FLOORS) {
    const f = await dt.resources.create({ parentId: garage.id, name: floor.name });
    store.set(f.id, { slotMinutes: SLOT_MINUTES, price: null });

    for (const zone of floor.zones) {
      const z = await dt.resources.create({
        parentId: f.id,
        name: zone.name,
        capacity: zone.capacity,
      });
      store.set(z.id, { slotMinutes: SLOT_MINUTES, price: zone.price });
      if (zone.name === MAINTENANCE_ZONE) maintenanceZoneId = z.id;
    }
  }

  // Close one zone tonight: 18:00–23:00 today, blocking. Fits inside the 00:00–23:59 schedule.
  if (maintenanceZoneId) {
    const start = base + 18 * 3_600_000;
    const end = base + 23 * 3_600_000;
    await dt.rules.create([{ resourceId: maintenanceZoneId, start, end, blocking: true }]);
  }

  return [garage.id];
}
