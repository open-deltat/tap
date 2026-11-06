Δt is one binary. No Postgres, no Redis, no sidecar to babysit. It keeps your calendars in memory while writing every change to a small append-only log on disk, so a restart picks up exactly where it left off. If you can run a single process and give it a port and a folder, you can host it.

## Run it with Docker

```bash
docker run -d --name deltat -p 5433:5433 \
  -v deltat-data:/data \
  -e DELTAT_PASSWORD=<your-password> \
  ghcr.io/open-deltat/deltat
```

The image is `ghcr.io/open-deltat/deltat`, tagged with each release (`0.5.0`, `0.5`, `latest`) and built for both x86 and ARM. It listens on 5433 and keeps its data in `/data`; the named volume keeps that across restarts.

With Docker Compose:

```yaml
services:
  deltat:
    image: ghcr.io/open-deltat/deltat:0.5
    ports:
      - "5433:5433"
    environment:
      DELTAT_PASSWORD: ${DELTAT_PASSWORD}
    volumes:
      - deltat-data:/data

volumes:
  deltat-data: {}
```

## Or run the binary

Δt is a Rust crate, so `cargo` builds it:

```bash
cargo install deltat
DELTAT_PASSWORD=<your-password> deltat
```

That listens on port 5433 and writes its logs to `./data`.

## Connect to it

An agent connects through the MCP server ([agent quickstart](/docs/quickstart)). Code connects through the TypeScript client or any Postgres driver:

```ts
import { DeltaT } from "@open-deltat/client";

const db = new DeltaT({
  host: "localhost",
  port: 5433,
  database: "acme",
  password: process.env.DELTAT_PASSWORD,
});
```

The `database` value picks your tenant. More on that below.

## Configuration

Everything is set through environment variables, and every one has a default.

| Variable | What it does | Default |
| --- | --- | --- |
| `DELTAT_PASSWORD` | The password every connection must give | a random one, printed once at start |
| `DELTAT_PORT` | Port to listen on | `5433` |
| `DELTAT_BIND` | Address to listen on | `0.0.0.0` |
| `DELTAT_DATA_DIR` | Folder for the logs | `./data` (`/data` in the image) |
| `DELTAT_MAX_HOLD_TTL_MS` | The longest a hold may last | `3600000` (1 hour) |
| `DELTAT_GC_RETENTION_MS` | How long past bookings and expired holds are kept | `604800000` (7 days) |
| `DELTAT_COUNTER_OFFER` | How many alternative times a refusal carries (0 turns it off, 3 at most) | `3` |
| `DELTAT_TLS_CERT`, `DELTAT_TLS_KEY` | Serve TLS with this certificate and key (set both) | off |
| `DELTAT_MAX_CONNECTIONS` | Connections at once | `256` |
| `DELTAT_METRICS_PORT` | Serve Prometheus metrics on this port at `/metrics` | off |
| `DELTAT_LOG_FORMAT` | `json` for JSON logs, anything else for text | text |

**Set `DELTAT_PASSWORD`.** Without it, Δt makes up a random password at every start and prints it once, so nothing that stored the old one can reconnect after a restart. There is one shared password for the whole instance; `DELTAT_TENANT_PASSWORDS` (`tenant:password,tenant:password`) sets one per tenant, but a tenant without its own entry falls back to the shared one. Anything reachable from outside should also get TLS.

## The data directory

Each tenant gets its own append-only log file in the data directory, and the log is the source of truth: a change is confirmed only once it is on disk, and a restart replays the log. ([Under the hood](/docs/protocol-and-engine) has the exact order.) Backups are simple: copy the directory and you have copied the state. Delete it and you have a clean slate.

## Tenants are just the database name

There is no tenant table. The `database` name on the connection is the tenant, and the first connection with a new name creates its engine and log file on the spot.

```ts
const acme = new DeltaT({ database: "acme", password: pw });
const other = new DeltaT({ database: "another-org", password: pw });
```

Those two are fully separate because they are separate files, not a filter you have to remember to add. The name is cleaned down to letters, digits, `_` and `-` before it becomes a file name, so it can never point outside the data directory.

## Cleanup runs itself

A background sweep inside each tenant does three jobs without being asked:

- **Expired holds.** A hold stops counting the moment it expires; the sweep removes it from the list every few seconds.
- **Log compaction.** A log that grows past a threshold is rewritten smaller.
- **Old bookings.** Past bookings and expired holds older than `DELTAT_GC_RETENTION_MS` are removed. Open hours and blackouts are never removed.

## Updating

Pull a newer image or `cargo install` a newer version and restart with the same data directory. Back up the directory first: each release's notes say whether its log format changed, and a log written by a newer Δt is not meant to be read by an older one.

## Rather not run it?

A [founding pilot](/#pricing) gets you Δt hosted in the EU, run by the person who wrote it.
