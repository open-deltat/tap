import { DeltaT } from "@open-deltat/client";

// One deltat, two tenants. Each gets its own engine, WAL, reaper and GC inside deltat, so anything
// strangers create on the public site cannot bloat, slow, or corrupt the curated demos. The
// connection pool is lazy, so naming a tenant here costs nothing until something queries it.
function connect(database: string): DeltaT {
  return new DeltaT({
    host: process.env.DELTAT_HOST ?? "localhost",
    port: Number(process.env.DELTAT_PORT ?? 5433),
    database,
    username: process.env.DELTAT_USER ?? "user",
    password: process.env.DELTAT_PASSWORD ?? "secret",
  });
}

/** The curated demos and docs examples. Seeded by us, reset by us. */
export const dt = connect(process.env.DELTAT_DB ?? "demo");

/** Bookables strangers created through the public form. Never seeded, never reset. */
export const dtPublic = connect(process.env.DELTAT_PUBLIC_DB ?? "public");
