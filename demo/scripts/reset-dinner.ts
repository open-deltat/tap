import { DeltaT } from "@open-deltat/client";

// Drops the dinner-* friend resources so ensureRulesExample() reseeds them with the current schedules.
// Run from tap/demo: DELTAT_PORT=5434 DELTAT_PASSWORD=secret bun scripts/reset-dinner.ts
const dt = new DeltaT({
  host: process.env.DELTAT_HOST ?? "localhost",
  port: Number(process.env.DELTAT_PORT ?? 5434),
  database: process.env.DELTAT_DB ?? "demo",
  username: process.env.DELTAT_USER ?? "user",
  password: process.env.DELTAT_PASSWORD ?? "secret",
});

const roots = await dt.resources.get({ roots: true });
const targets = roots.filter((r) => r.name?.startsWith("dinner-"));
for (const r of targets) {
  await dt.resources.delete(r.id);
  console.log(`deleted ${r.name} (${r.id})`);
}
console.log(`done: removed ${targets.length} dinner resources`);
await dt.sql.end();
