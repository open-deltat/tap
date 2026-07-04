/**
 * Pre-seed the database with the ENABLED examples' boilerplate in one shot.
 *
 *   DELTAT_PORT=5434 DELTAT_PASSWORD=deltat bun scripts/seed-all.ts          # full catalog
 *   DEMO_EXAMPLES=cinema DELTAT_PORT=5434 bun scripts/seed-all.ts            # cinema only
 *
 * Each seed is idempotent (no-ops if its root already exists), so this is safe to re-run.
 * Which examples run is governed entirely by DEMO_EXAMPLES (see examples/config.ts).
 */
import { enabledExampleIds } from "@/examples/config";
import { SEEDS } from "@/examples/seeds";
import { getResources } from "@open-deltat/examples/actions/resources";

const ids = enabledExampleIds();
console.log(`Seeding ${ids.length} example(s): ${ids.join(", ")}\n`);
for (const id of ids) {
  await SEEDS[id]();
  console.log(`  ✓ ${id}`);
}

const all = await getResources();
const roots = all.filter((r) => r.parentId === null);
console.log(`\nDone. ${all.length} resources across ${roots.length} roots:`);
for (const r of roots) {
  console.log(`  · ${r.name} (${all.filter((c) => c.parentId === r.id).length} children)`);
}
process.exit(0);
