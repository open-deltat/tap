The rest of these docs treat Δt as a clean idea: time is one line, a booking is a stretch on it, and two stretches collide when they cover the same moment. This page is the short tour of what is actually running underneath that idea. You do not need any of it to use Δt, but it helps to know what you are talking to.

The short version: Δt is one program. There is no separate database to install, no Postgres hiding behind it, no Redis, no sidecar. You run a single binary and that is the whole thing.

## One binary, no database

Δt is a single Rust binary, and all of your live data sits in memory while it runs. That is what makes it quick to answer "what is free?". Reading from memory is fast.

Memory alone would be a problem the moment the process restarts, so every change is also written to an append-only log on disk before it touches memory. The log is the real source of truth; the in-memory copy is just a fast projection of it. When Δt starts back up, it replays the log and rebuilds its state, so a restart does not lose your Acme Tickets seats. If the machine crashed mid-write, only the unfinished tail of the log is dropped on the way back up. Everything that was fully written is still there.

In practice that means there is exactly one thing to back up: the data directory holding those logs. Copy it and the instance survives a move. Delete it and you get a clean slate.

## It speaks Postgres, for now

Today Δt talks to clients over the PostgreSQL wire protocol. That is the one detail that explains the SDK: there is no Postgres underneath, but Δt answers the same handshake a Postgres server would, so a normal Postgres client can connect to it. The tap client wraps exactly such a connection, which is why opening a database looks like this:

```ts
const db = new DeltaT({ host: "localhost", port: 5433, database: "acme", password: "deltat" });
```

Same idea for live updates. You can subscribe to a resource and Δt pushes changes to you as they happen, and a change on a child seat bubbles up to anyone watching the section or the stadium above it:

```ts
const stop = await db.events.listen(seat.id, (e) => console.log(e));
await stop();
```

This Postgres-shaped transport is honestly a transitional choice, not the long-term plan. There is a cleaner, framed protocol in the works to replace it, built around a transport-neutral command type that the SQL layer already feeds into. When that lands, the wire and SQL layers go away and the SDK keeps working the same way.

## What is not built yet

Two further front doors are planned on top of that framed protocol, and it is worth being clear that neither exists today:

- An HTTP/JSON adapter, so any HTTP client could talk to Δt without a Postgres driver.
- An MCP tool surface, so an AI agent could search, check availability, and book.

Both are on the roadmap. Neither ships at the moment, so for now the way in is the Postgres-wire connection above.

## One Δt, many tenants

A single Δt instance can hold many independent worlds, and they are kept apart by the database name on the connection. The `database: "acme"` in the example above is the whole isolation story: Acme Tickets gets its own engine and its own log, created the first time it is used, completely separate from any other tenant on the same instance. There is no shared table that everyone reads from with a filter; the separation is real, at the storage level.

## A word on speed

Δt answers availability quickly because the answer is computed from data already sitting in memory, with nothing to fetch from a separate database. That is the entire speed claim, and it is worth being precise about what it is not. It is not a promise about how fast a single write becomes durable on disk, and it is not a promise about talking to Δt from another region across the network. It is just: reading from RAM is fast, and availability is a read.

Most of the time you will never touch any of this. To get back to the model it sits beneath, see the [Data model](/docs/data-model).
