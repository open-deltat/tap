# TAP — Time Allocation Protocol

SDK and demo applications for [deltat](https://github.com/open-tap/deltat), a time-allocation database.

## Structure

```
packages/client/   @open-tap/client — TypeScript SDK wrapping deltat's pgwire SQL
demo/              Next.js app — interactive demos for holds, calendars, seat maps, etc.
```

## SDK

`@open-tap/client` provides a typed interface to deltat:

- **Resources** — hierarchical create/update/delete/get
- **Rules** — batch `create(items[])`, update, delete, get
- **Bookings** — batch `create(items[])`, cancel, get with optional `{start, end}` filter
- **Holds** — place, release, get with optional `{start, end}` filter
- **Availability** — single and combined multi-resource queries
- **Events** — real-time LISTEN/NOTIFY subscriptions
- **`expandRecurrence()`** — expand recurring patterns (days of week, time range, date range, excludes) into concrete rule segments

```ts
import { DeltaT, expandRecurrence } from "@open-tap/client";

const dt = new DeltaT({ host: "localhost", port: 5433 });

const resource = await dt.resources.create({ name: "Room A" });

const segments = expandRecurrence({
  daysOfWeek: [1, 2, 3, 4, 5],
  startTime: "09:00",
  endTime: "17:00",
  fromDate: "2025-01-01",
  toDate: "2025-03-31",
});

await dt.rules.create(
  segments.map((s) => ({ resourceId: resource.id, ...s }))
);

const slots = await dt.availability.get({
  resourceId: resource.id,
  start: Date.now(),
  end: Date.now() + 86_400_000,
});
```

## Demos

| Demo | Description |
|------|-------------|
| **Airline** | Split-screen dual-client seat booking with real-time holds |
| **Theater** | Single-venue seat map with section pricing |
| **Stadium** | Large-venue seat selection with timed events |
| **Calendar** | Resource management with weekly/daily views and recurring rules |
| **Scheduling** | Multi-resource availability finder with threshold modes |
| **Availability** | Calendly-style owner/booker flow with hold-to-confirm |
| **Restaurant** | Party size → floor plan → time slot → reservation |
| **Parking** | Multi-floor garage with zone grids and duration-based booking |

All demos use WebSocket connections for real-time updates. Hold-based demos use a connection-lifecycle pattern: opening a WS places a hold, sending `{type: "confirm"}` atomically books, closing the WS releases the hold.

### Prerequisites

- [Bun](https://bun.sh)

### Run

```bash
cd demo
bun install
bun dev      # starts deltat + Next.js dev server
```

The dev script auto-installs deltat via `cargo install` if not found or outdated.

## License

MIT
