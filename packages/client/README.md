# @open-deltat/client

The TypeScript SDK for **TAP**, the Time Allocation Protocol: an open standard for scheduling, booking, and availability. It points at [deltat](https://github.com/open-deltat/deltat), the database built to speak TAP, though any backend that implements the protocol works the same way.

deltat speaks the PostgreSQL wire protocol (a transitional transport; a v2 framed protocol with
HTTP and MCP adapters is planned), so this SDK connects with a standard Postgres client and exposes
a typed interface over it.

## Install

```bash
bun add @open-deltat/client
# or: npm install @open-deltat/client
```

## Usage

```ts
import { DeltaT, expandRecurrence } from "@open-deltat/client";

const dt = new DeltaT({ host: "localhost", port: 5433, database: "default", password: "..." });

const room = await dt.resources.create({ name: "Room A" });

// Expand a recurring pattern into concrete rule segments, then store them as open hours.
// Wall-clock times are interpreted in the given IANA timeZone (default "UTC") and stay
// correct across DST transitions.
const segments = expandRecurrence({
  daysOfWeek: [1, 2, 3, 4, 5],
  startTime: "09:00",
  endTime: "17:00",
  fromDate: "2025-01-01",
  toDate: "2025-03-31",
  timeZone: "Europe/Berlin",
});
await dt.rules.create(segments.map((s) => ({ resourceId: room.id, ...s })));

const slots = await dt.availability.get({
  resourceId: room.id,
  start: Date.now(),
  end: Date.now() + 86_400_000,
});
```

## Holds: reserve, then commit

A hold takes a span out of availability while your user decides. To keep the slot, commit the
hold: the server converts it into a booking in a single atomic statement, so no competing writer
can steal the span in between. (Do not release the hold and re-insert a booking yourself; that
two-step leaves a window where another client can win the very slot the hold protected.)

```ts
const hold = await dt.holds.place({
  resourceId: room.id,
  start,
  end,
  expiresAt: Date.now() + 600_000, // requested, see below
});

const { bookingId } = await dt.holds.commit(hold.id, { label: "seat 14F" });
```

`expiresAt` is a request, not an assignment: the server clamps it to its own clock plus a maximum
hold TTL (`DELTAT_MAX_HOLD_TTL_MS`, default 1 hour), and the clamped value is what conflict
checks, availability, and the reaper use. The `Hold` returned by `place` echoes what you asked
for, so read the hold back with `holds.get` when you need the effective expiry (countdown UIs,
renewal logic). A hold that must outlive the cap has to be re-placed or renewed before it expires.
`commit` rejects if the hold is unknown, already released, or expired; place a new hold and retry.

## API

- **`resources`**: hierarchical create/update/delete/get
- **`rules`**: batch `create(items[])`, update, delete, get (open hours and blocked windows)
- **`bookings`**: batch `create(items[])`, cancel, get with an optional `{start, end}` filter
- **`holds`**: place, commit (atomic hold-to-booking conversion), release, get with an optional `{start, end}` filter
- **`availability`**: single- and multi-resource queries (`min_available` for "any k of N free")
- **`events`**: real-time LISTEN/NOTIFY subscriptions
- **`expandRecurrence()`**: expand a recurring pattern (days of week, time range, date range, excludes) into concrete rule segments, DST-safe in an explicit IANA `timeZone` (default UTC); overnight and until-midnight (`"24:00"`) windows supported

All times are Unix milliseconds. Intervals are half-open `[start, end)`; adjacent intervals do not collide.

## License

MIT
