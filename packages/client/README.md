# @open-tap/client

TypeScript SDK for [deltat](https://github.com/open-deltat/deltat), a time-allocation database.

deltat speaks the PostgreSQL wire protocol (a transitional transport; a v2 framed protocol with
HTTP and MCP adapters is planned), so this SDK connects with a standard Postgres client and exposes
a typed interface over it.

## Install

```bash
bun add @open-tap/client
# or: npm install @open-tap/client
```

## Usage

```ts
import { DeltaT, expandRecurrence } from "@open-tap/client";

const dt = new DeltaT({ host: "localhost", port: 5433, database: "default", password: "..." });

const room = await dt.resources.create({ name: "Room A" });

// Expand a recurring pattern into concrete rule segments, then store them as open hours.
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

## API

- **`resources`**: hierarchical create/update/delete/get
- **`rules`**: batch `create(items[])`, update, delete, get (open hours and blocked windows)
- **`bookings`**: batch `create(items[])`, cancel, get with an optional `{start, end}` filter
- **`holds`**: place, release, get with an optional `{start, end}` filter
- **`availability`**: single- and multi-resource queries (`min_available` for "any k of N free")
- **`events`**: real-time LISTEN/NOTIFY subscriptions
- **`expandRecurrence()`**: expand a recurring pattern (days of week, time range, date range, excludes) into concrete rule segments

All times are Unix milliseconds. Intervals are half-open `[start, end)`; adjacent intervals do not collide.

## License

MIT
