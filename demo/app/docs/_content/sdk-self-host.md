Δt is one binary. No Postgres, no Redis, no sidecar to babysit. You build it, you run it, and it keeps your time-allocation state in memory while writing every change to a small append-only log on disk so a restart picks up exactly where it left off.

If you can run a single process and give it a port and a folder, you can host it.

## Build and run

It is a Rust binary, so a release build and a run is the whole story:

```bash
cargo build --release
DELTAT_PASSWORD=<your-password> ./target/release/deltat
```

That starts the server listening on port 5433. Point the TAP client at it and you are talking to it:

```ts
import { DeltaT } from "@open-deltat/client";

const db = new DeltaT({
  host: "localhost",
  port: 5433,
  database: "acme-tickets",
  password: process.env.DELTAT_PASSWORD,
});
```

The `database` value is the only thing that picks your tenant. More on that below.

## Configuration

Everything is set through environment variables, and every one has a default. The defaults are fine for poking at it on your laptop. The one you must set for anything reachable over a network is the password.

| Variable | What it does | Default |
| --- | --- | --- |
| `DELTAT_PORT` | TCP port the server listens on | `5433` |
| `DELTAT_BIND` | Address to bind to | `0.0.0.0` |
| `DELTAT_DATA_DIR` | Folder where the write-ahead logs live | `./data` |
| `DELTAT_PASSWORD` | The single cleartext password checked on every connection | (has a built-in default) |
| `DELTAT_GC_RETENTION_MS` | How long past bookings and expired holds are kept before cleanup | `604800000` (7 days) |

A note on `DELTAT_PASSWORD`: auth is a single shared password, sent in cleartext, checked when a client connects. If you leave it unset it falls back to a built-in default. That is harmless on localhost and wrong the moment the port is reachable by anyone else, so set it.

## The data directory

`DELTAT_DATA_DIR` is where durability lives. Each tenant gets its own append-only write-ahead log file in that folder. Every change is written to the log first and only then applied in memory, so the log is the source of truth and memory is just the fast projection of it.

That makes backups boring in the best way: copy the data directory and you have copied the state. Delete it and you have a clean slate.

## Tenants are just the database name

There is no tenant table and no shared column to filter on. The `database` name on the connection *is* the tenant. The first time a client connects with a new database name, Δt creates a dedicated engine and its own log file for it, on the spot.

```ts
const acme = new DeltaT({ database: "acme-tickets", password: pw });
const other = new DeltaT({ database: "another-org", password: pw });
```

Those two are fully isolated because they are backed by separate files, not by a query filter you have to remember to add. The name is sanitized down to letters, digits, underscores, and hyphens before it becomes a filename, so a tenant name can never wander out of the data directory.

## Cleanup runs itself

You do not schedule anything. A background reaper inside each tenant quietly handles three jobs on its own:

- Hold expiry. A hold carries its own self-destruct time, so it stops blocking a slot the moment it expires whether or not anything has swept it yet. The reaper is just there to physically remove the dead ones so the list does not grow forever.
- Log compaction. Once a log grows past a threshold it gets compacted in place.
- Garbage collection. Past bookings and expired past holds older than `DELTAT_GC_RETENTION_MS` are collected. Rules are never collected, so your open-hours and blackout schedule always stays put.

## Docker Compose

The repository ships a `docker-compose.yaml` that brings up Δt and the demo together. If you just want Δt on its own, a minimal service is enough: build it from the public source, publish the port, set the password, and mount a named volume at the data directory so state survives a container restart.

```yaml
services:
  deltat:
    build: https://github.com/open-deltat/deltat.git#main
    ports:
      - "5433:5433"
    environment:
      DELTAT_PASSWORD: ${DELTAT_PASSWORD}
      DELTAT_DATA_DIR: /data
    volumes:
      - deltat-data:/data

volumes:
  deltat-data: {}
```

`DELTAT_DATA_DIR` is set to match the mount, so the write-ahead logs ride on the named volume. Drop the volume for a fully ephemeral instance.

## What is not here yet

The transport today is the PostgreSQL wire protocol, which is why the TAP client connects like a Postgres client would. That is transitional. HTTP and MCP adapters are planned but do not exist yet, so for now the wire protocol is the only way in.
