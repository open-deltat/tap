The rest of these docs treat Δt as a clean idea: time is one line, a booking is a stretch on it, and two stretches collide when they cover the same moment. This page is the short tour of what actually runs underneath. You do not need any of it to use Δt, but it helps to know what you are talking to.

## One binary, no other database

Δt is a single Rust binary, open source under AGPL-3.0. There is no Postgres, Redis or sidecar behind it. While it runs, all live data sits in memory, which is why "what is free?" is fast: it is a little arithmetic over a sorted list, done in RAM.

Every change is also written to an append-only log on disk, and the log is the source of truth: on restart Δt replays it and is back where it was. You are told a hold, booking or commit succeeded only once it is on disk, and notifications go out only after that too. Other readers can see a new hold or booking a moment earlier, while it is still on its way to disk, so reads never wait on a write. If the machine dies in that moment, that one change is lost and the slot shows as free again: Δt can briefly show less free time than it ends up keeping, never more. Removing things (releases, cancellations) and changing rules and resources are written to disk first. If writing to disk ever fails, that tenant stops taking changes and is rebuilt from its log. So there is one thing to back up: the data directory.

## TAP: the language it speaks

TAP, the Time Allocation Protocol, is the small model every Δt surface shares: resources that hold time, rules that open and close it, holds and bookings that claim it, and availability as whatever is left. Every time is a whole number of milliseconds since 1970, and every stretch is half-open, `[start, end)`.

TAP keeps people's things at the edge. It has no time zones, no weekdays and no "every Tuesday". Your code (or the MCP server, for an agent) turns those into plain stretches before they reach Δt, and formats them on the way out. That is what keeps the core small and fast.

## Three ways in

All three reach the same engine and the same rules.

- **The MCP server** (`@open-deltat/mcp`) gives an agent find, hold and book as tools. It takes times with their zone (RFC 3339), turns weekly hours into concrete rules, and refuses one-step bookings on purpose. See the [agent quickstart](/docs/quickstart).
- **The TypeScript client** (`@open-deltat/client`) is a typed SDK: `resources`, `rules`, `availability`, `holds`, `bookings`, `events`. See the [SDK reference](/docs/sdk/reference).
- **The PostgreSQL wire protocol** is what both of those ride on. Δt answers the same handshake a Postgres server does, so any Postgres driver in any language can connect and send its small set of SQL statements. See [any Postgres client](/docs/guides/postgres-wire).

The Postgres wire is the current transport, not the final one. An HTTP/JSON way in is planned and not built; when it lands, the client and the MCP server keep working the same way.

## Live changes

Every hold, booking, release and cancel is sent to anyone listening on that resource, and to anyone listening on a resource above it, so watching a section hears every seat in it. Over the wire this is Postgres `LISTEN`; in the client it is `events.listen` and `events.watch`.

A listener that falls too far behind is told how many changes it missed. The right way to use a change is as a reason to read again, never as the full picture: a fresh read is always correct, however many changes were missed. Booking labels are never included in a change.

## Many tenants, one instance

One Δt holds many separate worlds, picked by the database name on the connection. Each tenant gets its own engine and its own log file, created the first time it is used. There is no shared table filtered by tenant; the separation is in the storage itself. The name is cleaned down to letters, digits, `_` and `-` before it becomes a file name, so it can never point outside the data directory.

## Who can connect

Today there is one shared password for the whole instance (`DELTAT_PASSWORD`); the username is ignored. Per-tenant passwords exist (`DELTAT_TENANT_PASSWORDS`), but a tenant without its own entry falls back to the shared one, so treat them as a convenience, not a security boundary. TLS is supported. Per-connection identity and permissions are planned and not built, so run Δt behind your own application or on a private network.

Holding a hold's id is what lets you commit or release it, which is why the MCP server hands hold ids back to the agent that made them.

## A word on speed

Δt answers availability quickly because the data is already in memory and there is no other database to ask. That is the whole speed claim. It is not a promise about how fast a write becomes durable on disk, or about talking to Δt from across the world.

To get back to the model this sits under, see the [data model](/docs/data-model). To run it, see [self-host](/docs/sdk/self-host).
