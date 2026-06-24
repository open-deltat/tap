Δt is a database for time, and it ships as one thing: a single Rust binary. No external database sits underneath it. State lives in memory and is made durable by an append-only WAL, so self-hosting is a build, a directory, and a password. This is the zero-license, one-command default: you run it, you point the SDK at it, and you own all of it.

## Build and run

```bash
cargo build --release
DELTAT_PASSWORD=<choose-a-secret> cargo run
```

That is the whole story. The binary opens a TCP listener and speaks the wire protocol the tap SDK connects over. Set `DELTAT_PASSWORD` to a secret of your choosing before you run; if you omit it the binary falls back to its default, which is fine for a local scratch instance and wrong for anything reachable.

## Configuration

Everything is configured by environment variable. Set them before launch.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DELTAT_PORT` | `5433` | TCP port the listener binds. |
| `DELTAT_BIND` | `0.0.0.0` | Bind address. |
| `DELTAT_DATA_DIR` | `./data` | Directory that holds the WAL files. This is the on-disk home of all durable state. |
| `DELTAT_PASSWORD` | (set this) | Cleartext password required on every connection. |
| `DELTAT_GC_RETENTION_MS` | 7 days | How long past bookings and expired past holds are kept before garbage collection. Rules are never collected. |

`DELTAT_DATA_DIR` is the only thing you need to persist. It is the WAL home: the append-only log with CRC framing and safe-truncation replay that reconstructs in-memory state on startup. Back it up, mount it on a volume, and the instance survives restarts. Delete it and you get a clean slate.

## One binary, no external database

There is no Postgres, no Redis, no sidecar. The engine is a self-contained Rust process: an in-memory state machine backed by the append-only WAL. Writes are group-committed, and on a WAL-append failure the in-memory state is not mutated, so a crash mid-write replays cleanly rather than corrupting state. The practical consequence for self-hosting: one process to run, one directory to keep.

## Tenants

A tenant is your own private database. Nobody else sees inside it. On the wire, the tenant is just the database name on the connection: when the SDK connects with `database: "acme"`, the binary serves the `acme` tenant.

```ts
const db = new DeltaT({
  host: "localhost",
  port: 5433,
  database: "acme",
  password: process.env.DELTAT_PASSWORD,
});
```

Each tenant gets its own Engine plus its own WAL, created lazily on first use and bounded. The tenant name is sanitized to `[A-Za-z0-9_-]` before it becomes a WAL filename, and an empty-after-sanitization name is rejected, which closes the path-traversal door. Tenant data isolation is enforced by this per-tenant Engine plus WAL split, not by a shared table with a tenant column. Authentication today is a single cleartext password checked on connect.

## What runs in the background

Each tenant spawns a background reaper alongside its Engine. It handles three jobs without any operator action:

- Hold expiry. A hold is a tentative allocation with a self-destruct timer; once its `expiresAt` passes, the reaper clears it so the slot returns to free.
- WAL compaction. The log is rewritten past a threshold so replay stays fast and the file does not grow without bound.
- Interval garbage collection. Past bookings and expired past holds older than `DELTAT_GC_RETENTION_MS` are collected. Rules are never collected.

You do not schedule or trigger any of this. It is part of the binary.

## Docker Compose

If you would rather not build locally, `tap/docker-compose.yaml` brings up the deltat binary and the examples app together. deltat builds straight from its Git URL, the demo reaches it over the internal compose network, and only the demo port is published.

```bash
DELTAT_PASSWORD=<choose-a-secret> docker compose up --build -d
```

The compose file mounts a named volume at the data directory for WAL persistence. Drop that volume line for a fully ephemeral demo instance.

## Next

The binary is now listening. Point the SDK at it and start creating resources, rules, bookings, and holds. See the [Quickstart](/docs/sdk/quickstart) for connecting the tap SDK.
