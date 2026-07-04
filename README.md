<p align="center">
  <img src=".github/social-preview.png" alt="TAP: the time allocation protocol" width="860">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@open-deltat/client"><img src="https://img.shields.io/npm/v/@open-deltat/client.svg?logo=npm" alt="npm"></a>
  <a href="https://github.com/open-deltat/tap/actions/workflows/ci.yml"><img src="https://github.com/open-deltat/tap/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/SDK-MIT-blue.svg" alt="SDK: MIT"></a>
  <a href="demo/LICENSE"><img src="https://img.shields.io/badge/apps-AGPL--3.0-orange.svg" alt="Apps: AGPL-3.0"></a>
  <a href="https://delt.at"><img src="https://img.shields.io/badge/site-delt.at-4fe3a3.svg" alt="delt.at"></a>
</p>

---

TAP is the Time Allocation Protocol, an open standard for scheduling, booking, and availability: one shared way to describe time and ask "what is free, and can I claim it before someone else does?", so any app, service, or agent speaks it the same way.

This repo is TAP in practice: its typed TypeScript SDK (`@open-deltat/client`) and a set of demo apps (seat maps, calendars, capacity pools, recurring schedules, and hold-to-book flows with live updates). The SDK points at [deltat](https://github.com/open-deltat/deltat), the database built to speak TAP, which treats availability as collision detection on the Unix-time number line. The protocol does not depend on it: any backend that implements TAP can be talked to the same way.

## Install

```bash
npm install @open-deltat/client
# or: bun add @open-deltat/client
```

## SDK

`@open-deltat/client` is a typed interface to deltat:

- **Resources** - hierarchical create / update / delete / get
- **Rules** - batch `create(items[])`, update, delete, get
- **Bookings** - batch `create(items[])`, cancel, get with an optional `{start, end}` window
- **Holds** - place, release, get with an optional `{start, end}` window
- **Availability** - single-resource and combined multi-resource queries
- **Events** - real-time LISTEN/NOTIFY subscriptions
- **`expandRecurrence()`** - turn a recurring pattern (days of week, time range, date range, exclusions) into concrete rule segments

```ts
import { DeltaT, expandRecurrence } from "@open-deltat/client";

const dt = new DeltaT({ host: "localhost", port: 5433 });

const room = await dt.resources.create({ name: "Room A" });

// Open weekdays 9 to 5 for the first quarter, as concrete rules.
const segments = expandRecurrence({
  daysOfWeek: [1, 2, 3, 4, 5],
  startTime: "09:00",
  endTime: "17:00",
  fromDate: "2025-01-01",
  toDate: "2025-03-31",
});
await dt.rules.create(segments.map((s) => ({ resourceId: room.id, ...s })));

const slots = await dt.availability.get({
  resourceId: room.id,
  start: Date.now(),
  end: Date.now() + 86_400_000,
});
```

> deltat's current transport is the PostgreSQL wire protocol, a transitional choice. A v2 framed protocol with HTTP and MCP adapters is planned (see deltat's `docs/REQUIREMENTS.md`, PROTO-01/02). The typed API above is built to outlast that swap.

## Demos

| Demo | What it shows |
|------|----------------|
| **Airline** | Split-screen dual-client seat booking with real-time holds |
| **Theater** | Single-venue seat map with section pricing |
| **Stadium** | Large-venue seat selection with timed events |
| **Calendar** | Resource management with weekly and daily views and recurring rules |
| **Scheduling** | Multi-resource availability finder with threshold modes |
| **Availability** | Calendly-style owner and booker flow with hold-to-confirm |
| **Restaurant** | Party size to floor plan to time slot to reservation |
| **Parking** | Multi-floor garage with zone grids and duration-based booking |

Every demo uses a WebSocket for live updates. The hold-based ones follow a connection-lifecycle pattern: opening a socket places a hold, sending `{type: "confirm"}` books it atomically, and closing the socket releases it.

## Run the demos

Requires [Bun](https://bun.sh).

```bash
cd demo
bun install
bun dev      # starts deltat and the Next.js dev server
```

The dev script installs deltat via `cargo install` if it is missing or out of date.

## Repository

```
packages/client/   @open-deltat/client, the TypeScript SDK over deltat's wire protocol
packages/shared/   date and week helpers shared by the apps
demo/              Next.js app with the interactive examples above
calendar/          standalone booking-calendar app
```

## License

Licensed by directory:

- **SDK and shared helpers** (`packages/`): [MIT](LICENSE). Use them anywhere, in any project, open or closed. This is what the npm package ships under.
- **Applications** (`demo/`, `calendar/`): [AGPL-3.0-or-later](demo/LICENSE). They are meant to be self-hosted and deployed; if you run a modified version as a network service, you must offer that version's source under the same license.

GitHub shows the root MIT license in the sidebar because it only reads the top-level file; the AGPL applies to the app directories regardless, via their own `LICENSE` files.
