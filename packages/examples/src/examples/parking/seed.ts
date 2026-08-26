"use server";

import { dt } from "../../lib/deltat";
import * as store from "../../lib/store";
import { ensureSchedule, daily, findRootByName, baseMs } from "../../actions/seed-helpers";

const NAME = "Downtown Garage";

// Open 24/7, inherited by every zone. dur 1440 (a full day) so consecutive days abut and merge
// into one continuous window; 1439 left a 1-minute gap at every midnight, so any window crossing
// midnight (an evening park, or "All day" from the afternoon) found no covering slot, every zone
// wrongly read "closed".
const ALWAYS_OPEN = daily([{ h: 0, m: 0, dur: 1440 }]);

// A zone is ONE capacity-N resource (N = spots in the zone). Booking one car is one booking
// on the zone; the engine's capacity sweep blocks the (N+1)th overlapping booking. Floors are
// purely structural parents, only zones carry capacity.
const FLOORS: { name: string; zones: { name: string; capacity: number; price: number }[] }[] = [
  {
    name: "Floor 1 · Street",
    zones: [
      { name: "Zone A", capacity: 48, price: 8 },
      { name: "Zone B", capacity: 36, price: 8 },
      { name: "Zone C", capacity: 30, price: 6 },
    ],
  },
  {
    name: "Floor 2 · Mezzanine",
    zones: [
      { name: "Zone D", capacity: 54, price: 6 },
      { name: "Zone E", capacity: 42, price: 5 },
    ],
  },
  {
    name: "Floor 3 · Tower",
    zones: [
      { name: "Zone F", capacity: 60, price: 5 },
      { name: "Zone G", capacity: 45, price: 4 },
      { name: "Zone H", capacity: 32, price: 4 },
    ],
  },
  {
    name: "Floor 4 · Rooftop",
    zones: [
      { name: "Zone J", capacity: 40, price: 4 },
      { name: "Zone K", capacity: 30, price: 4 },
    ],
  },
];

// One zone is closed for maintenance tonight (18:00–23:00 today) via a blocking rule.
const MAINTENANCE_ZONE = "Zone E";

export async function seedParking(): Promise<string[]> {
  const existing = await findRootByName(NAME);
  if (existing) {
    await ensureSchedule(existing, ALWAYS_OPEN);
    return [existing];
  }

  const base = baseMs();
  const garage = await dt.resources.create({ name: NAME });
  store.set(garage.id, { slotMinutes: 60, price: null });

  await ensureSchedule(garage.id, ALWAYS_OPEN);

  let maintenanceZoneId: string | null = null;

  for (const floor of FLOORS) {
    const f = await dt.resources.create({ parentId: garage.id, name: floor.name });
    store.set(f.id, { slotMinutes: 60, price: null });

    for (const zone of floor.zones) {
      const z = await dt.resources.create({
        parentId: f.id,
        name: zone.name,
        capacity: zone.capacity,
      });
      store.set(z.id, { slotMinutes: 60, price: zone.price });
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
