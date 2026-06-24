The concept pages describe Δt as if time were the whole database: a booking is a stretch on one line, and two stretches collide when they cover the same moment. That picture is true, and it is deliberately silent about two things: how a command reaches the engine, and how state survives a crash. This page isolates that truth so it does not leak into the concept pages.

Read it when you care about the wire, the disk, or the latency number. Skip it when you are reasoning about availability.

## Honest tense

Δt has a transport it ships today and a transport it is built toward. They are not the same, and the gap is intentional.

- **Today, at HEAD:** the only transport is the PostgreSQL wire protocol. SQL text is parsed by `sqlparser` into a `Command`, and `Command` is executed against the engine. This is the current, transitional core. It is explicitly slated for deletion, not the long-term answer.
- **The target core:** a framed `Command` / `Response` / `Event` protocol, NDJSON by default with `postcard` as the optional compact encoding. The `Command` half of this already exists and is already transport-neutral.
- **Planned on top of the framed core:** an HTTP/JSON adapter and an MCP tool surface. Both are planned, not built.

Everything below labels itself: current, ready, or planned. Nothing here is aspirational without saying so.

## The current transport (transitional)

At HEAD the engine speaks one protocol: PostgreSQL wire, `pgwire 0.37` plus `sqlparser 0.59`. There is no Postgres underneath. Δt is a single Rust binary that happens to answer the pgwire handshake, so a standard Postgres client (and the TypeScript SDK, which wraps a `postgres` `Sql` instance) can connect.

```ts
const db = new DeltaT({ host: "localhost", port: 5433, database: "acme", password: "deltat" });
```

The flow is: SQL text arrives over pgwire, `sqlparser` (PostgreSqlDialect) parses it, and `src/sql.rs` translates the AST into one of the variants of the `Command` enum. `wire.rs::execute_command` then runs that `Command` against the engine. SQL-the-language is not the same thing as pgwire-the-protocol; the language is just one producer of `Command`.

This whole layer is transitional. The remaining work is to delete pgwire and SQL once the framed protocol lands. Treat anything that depends on the pgwire transport (including `DeltaT.sql`, the raw underlying `Sql` escape hatch) as load-bearing only until then.

Real-time change notification today rides this same transport. LISTEN/NOTIFY channels are named `resource_{ULID}`, events are pushed as pgwire `NotificationResponse` frames carrying a JSON `Event` payload, and a listener that lags past the broadcast capacity (256 events) is silently dropped.

```ts
const stop = await db.events.listen(room.id, (e) => console.log(e));
await stop();
```

## The target core: framed Command / Response / Event

The long-term core is a framed protocol with three message kinds: `Command` in, `Response` out, `Event` pushed. The default encoding is NDJSON (one JSON object per line); `postcard` is the optional compact binary encoding.

The reason this is more than a plan: the `Command` half is already done and already transport-neutral. The `Command` enum was extracted out of the SQL parser into its own module, `src/command.rs`. That module depends only on the kernel value types and `ulid`. It never imports `sqlparser`:

```rust
// src/command.rs
use ulid::Ulid;

use crate::model::*;
```

Because of that, a framed adapter can build the same `Command` and hand it to `wire::execute_command` without dragging in `sqlparser`, and the kernel can later be carved into its own crate without the SQL seam following it. `sql.rs` becomes one producer of `Command` among several, rather than the only door in.

The verb naming has not converged yet. The target canonical lifecycle vocabulary (Resource create/update/delete, Rule add/update/remove, Hold place/commit/release, Booking confirm/cancel, Subscription subscribe/unsubscribe) is a target, not the shipped surface. Today the protocol speaks SQL CRUD and the TypeScript SDK speaks `rules.create`/`delete`, `bookings.create`/`cancel`, `holds.place`/`release`, `events.listen`. No `commit` verb exists at any layer yet.

## Planned adapters (not built)

Two adapters are planned over the framed `Command` core. Neither exists at HEAD.

- **HTTP/JSON:** the universal external surface. POST a `Command`; GET cacheable availability. This is the surface that lets any HTTP client talk to Δt without a Postgres driver.
- **MCP tool surface:** the AI-native interface, exposing three tools: `search_bookable`, `get_availability`, and `book`.

Both target the same transport-neutral `Command` core, which is exactly why the `command.rs` extraction is the prerequisite that is already done.

## The engine

The engine is a single self-contained Rust binary. There is no external database. State lives in memory (a sharded `DashMap` store) and is made durable by an append-only Write-Ahead Log.

### WAL framing

Each WAL record is framed as `[u32 LE length][bincode Event][u32 LE CRC32 of payload]`. The length excludes the CRC. There is no magic number and no version byte today; that is a property of the current WAL, and the v2 format will add framing stability rules.

```rust
// src/wal.rs — one entry: [len][bincode][crc32]
let payload = bincode::serialize(event)?;
let len = payload.len() as u32;
let crc = crc32fast::hash(&payload);
writer.write_all(&len.to_le_bytes())?;
writer.write_all(&payload)?;
writer.write_all(&crc.to_le_bytes())?;
```

### Group commit and safe-truncation replay

The WAL writer is group-commit: one `flush_sync` per batch of events rather than one per event. On startup, replay reads entries until the first truncated entry, CRC mismatch, or deserialize failure, then returns the events accumulated so far. Trailing corruption (a crash mid-write) never errors out replay; it is simply discarded along with everything after it.

### No state mutation on append failure

The ordering invariant is: persist first, then mutate. `persist_and_apply` does `wal_append().await?` before `store.apply_event`. If the append fails, the in-memory state is not touched. The WAL is the source of truth; in-memory state is a derived projection of it.

Events also bubble up the resource tree: a mutation notifies the target resource, then walks `parent_id` upward notifying each ancestor.

## Multi-tenant isolation

Each tenant gets its own `Engine` plus its own WAL. They are created lazily on first use and bounded. The tenant identity comes from the database name on the connection.

Isolation is enforced at the filesystem boundary. The tenant name is sanitized to `[A-Za-z0-9_-]` before it becomes the WAL filename, and an empty-after-sanitization name is rejected. This is the path-traversal guard, and it is tested.

```rust
// src/tenant.rs
let safe_name: String = tenant
    .chars()
    .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
    .collect();
if safe_name.is_empty() {
    return Err(std::io::Error::new(
        std::io::ErrorKind::InvalidInput,
        "empty tenant name",
    ));
}
let wal_path = self.data_dir.join(format!("{safe_name}.wal"));
```

Tenant data isolation (separate Engine plus WAL per database) is implemented and tested today.

## The latency number, honestly

The concept pages answer "what is free?" in well under a millisecond. That claim is precise about which operation it covers, and this is where it gets stated exactly.

Sub-millisecond is an **in-region RAM-read / amortized-write** property, and nothing more:

- A cache or RAM-hit read is about **100 ns**.
- An interval-tree availability query is about **depth times ~100 ns** (DRAM-miss bound).

It is explicitly **not**:

- A single durable commit. One `fsync` is about **0.14 to 3.8 ms**, which is two-to-four orders of magnitude slower. Group commit amortizes that fsync across a batch, which is why the write path is described as amortized, never per-commit.
- A cross-region round-trip. Speed-of-light alone is about **100 to 250 ms** between regions.

The number is measured by the stress bench over the pgwire path, which prints n/avg/p50/p95/p99/max but asserts no threshold and is not in CI. It is a measured characteristic, not a gated guarantee. When you quote the sub-ms figure, quote the read; do not attach it to a durable commit or a cross-region call.
