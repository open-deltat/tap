/**
 * Pre-seed the database with every demo's boilerplate data in one shot.
 *
 *   DELTAT_PORT=5434 DELTAT_PASSWORD=deltat bun scripts/seed-all.ts
 *
 * Each seed is idempotent (it no-ops if its root already exists), so this is safe to re-run.
 * Useful for tests and for populating a fresh node so every example works immediately.
 */
import { seedAirline } from "@/app/actions/seed-airline";
import { seedTheater } from "@/app/actions/seed-theater";
import { seedStadium } from "@/app/actions/seed-stadium";
import { seedCinema } from "@/app/actions/seed-cinema";
import { seedRestaurant } from "@/app/actions/seed-restaurant";
import { seedParking } from "@/app/actions/seed-parking";
import { seedAvailabilityScheduler } from "@/app/actions/seed-availability-scheduler";
import { ensurePersonalCalendar } from "@/app/actions/seed-personal-calendar";
import { ensureMeetCalendars } from "@/app/actions/seed-meet";
import { ensureHotel } from "@/app/actions/seed-hotel";
import { getResources } from "@/app/actions/resources";

const SEEDS: [string, () => Promise<unknown>][] = [
  ["Airline (2 flights, cabins, seats — some sold)", seedAirline],
  ["Theater (Hamilton — sections, seats, showtimes)", seedTheater],
  ["Stadium (sections, seats, events)", seedStadium],
  ["Cinema (4 screens, films, showtimes — some sold)", seedCinema],
  ["Restaurant (sections, tables)", seedRestaurant],
  ["Parking (floors, zones, spots)", seedParking],
  ["Availability scheduler", seedAvailabilityScheduler],
  ["Personal calendar (availability windows)", ensurePersonalCalendar],
  ["Meet (Alice & Bob calendars)", ensureMeetCalendars],
  ["Hotel (room types with capacity)", ensureHotel],
];

console.log("Seeding all demo data…\n");
for (const [label, fn] of SEEDS) {
  await fn();
  console.log(`  ✓ ${label}`);
}

const all = await getResources();
const roots = all.filter((r) => r.parentId === null);
console.log(`\nDone. ${all.length} resources across ${roots.length} venues/calendars:`);
for (const r of roots) console.log(`  · ${r.name} (${all.filter((c) => c.parentId === r.id).length} children)`);
process.exit(0);
