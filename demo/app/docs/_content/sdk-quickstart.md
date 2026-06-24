The fastest path from zero to a confirmed booking. We follow one scenario end to end: the seat **Seat 12**, in **Section A**, of the **Stadium**, owned by the tenant **Acme Tickets**. By the end you will have opened a seat for sale, checked that it is free, held it while a buyer decides, and turned that hold into a booking.

This is the same model the [Data model](/docs/data-model) page describes: a tenant holds resources, resources can hold resources, and the smallest one carries a timeline. Everything on that timeline is a labelled stretch. You store three kinds, and Δt works out the fourth: open time, minus blocked, minus booked, leaves what is free.

## Install

```bash
bun add @open-tap/client
```

## Connect

The SDK talks to deltat over the PostgreSQL wire protocol, so it is built on a `postgres`-compatible connection (Bun's `postgres` driver works directly). You construct a client from connection options:

```ts
import { DeltaT } from "@open-tap/client";

const db = new DeltaT({
  host: "localhost",
  port: 5433,
  database: "acme",
  password: "deltat",
});
```

The `database` field selects the tenant: Acme Tickets gets its own private database, and nobody else sees inside it. Defaults are `host: "localhost"`, `port: 5433`, `database: "default"`, `password: "deltat"`, so you only pass what differs.

> pgwire is the current, transitional transport, not the long-term core. It is why the connection looks like Postgres even though there is no Postgres underneath. For the why (and what replaces it), see [Protocol and engine](/docs/protocol-and-engine). You do not need to think about it to use the SDK: every verb below is a typed method, not raw SQL.

All times are Unix milliseconds. Intervals are half-open `[start, end)`.

## 1. Create the resource

A resource is anything you can book. Create the seat. Capacity defaults to `1`, which is exactly right for a single seat.

```ts
const seat = await db.resources.create({ name: "Seat 12" });
```

`create` returns the resource with its generated `ulid` id:

```ts
// { id: "01J...", parentId: null, name: "Seat 12", capacity: 1, bufferAfter: null }
```

Resources nest. To build the full Acme Tickets tree (Stadium > Section A > Seat 12), create the parents, read back their ids, then create the children. Children inherit open hours from their ancestors, so opening the Stadium's hours opens them for every seat inside it.

```ts
const stadium = await db.resources.create({ name: "Stadium" });
const sectionA = await db.resources.create({ parentId: stadium.id, name: "Section A" });
const seat12 = await db.resources.create({ parentId: sectionA.id, name: "Seat 12" });
```

## 2. Open the hours

A rule is an open or closed region of time on the resource's line. A non-blocking rule (open hours) says "this is on sale"; a blocking rule (blackout) carves time back out. `create` takes one or many rules and treats `blocking` as `false` when omitted.

Open Seat 12 for one show, say 8pm to 11pm tonight:

```ts
const [openHours] = await db.rules.create([
  { resourceId: seat.id, start: 1719270000000, end: 1719280800000 },
]);
```

If you later need to swap the whole sale window without ever leaving the seat unsellable mid-change, use `replaceOpenHours`: it creates the new open-hours rules first, then deletes the stale ones, and leaves blocking rules and bookings untouched.

```ts
await db.rules.replaceOpenHours(seat.id, [
  { start: 1719270000000, end: 1719280800000 },
]);
```

## 3. Ask what is free

Availability is derived, never stored. Δt computes it on demand as open windows, minus blocking rules, minus active allocations (bookings plus live holds), each allocation extended by its buffer. That is the "open minus blocked minus booked" subtraction, run for you.

```ts
const slots = await db.availability.get({
  resourceId: seat.id,
  start: 1719270000000,
  end: 1719280800000,
});
// [{ start: 1719270000000, end: 1719280800000 }]
```

Slots carry only `start` and `end`. Pass `minDuration` (in ms) to drop slots shorter than a threshold, for example a 30-minute minimum:

```ts
const usable = await db.availability.get({
  resourceId: seat.id,
  start: 1719270000000,
  end: 1719280800000,
  minDuration: 1800000,
});
```

## 4. Place a hold

When a buyer picks the seat, place a hold: a tentative allocation with a self-destruct timer. It counts as taken for everyone the instant it lands, and it releases itself if no one confirms. That tiny timer is what stops two buyers grabbing the same seat. `expiresAt` is an absolute Unix ms instant; expired holds are ignored by availability automatically.

```ts
const hold = await db.holds.place({
  resourceId: seat.id,
  start: 1719270000000,
  end: 1719280800000,
  expiresAt: Date.now() + 120000, // 2-minute window to check out
});
```

While the hold is live, step 3 run again returns no free slot for that seat. If the buyer walks away, the hold expires and the seat is free again with nothing to clean up. If you want to drop it early (for example the buyer cancelled), release it:

```ts
await db.holds.release(hold.id);
```

## 5. Confirm the booking

When the buyer pays, turn the seat into a real booking. `create` takes one or many bookings and returns them with generated `ulid` ids; `label` is optional.

```ts
const [booking] = await db.bookings.create([
  {
    resourceId: seat.id,
    start: 1719270000000,
    end: 1719280800000,
    label: "Order #4821",
  },
]);
```

That is the full path: a free seat is now a booked seat. To undo it:

```ts
await db.bookings.cancel(booking.id);
```

> Today, hold-to-booking is two steps (release the hold, then create the booking) rather than one atomic operation. A single-lock commit is on the roadmap but not built yet; see [Protocol and engine](/docs/protocol-and-engine) for the current guarantees.

## 6. Close the connection

When you are done, close the underlying connection pool:

```ts
await db.close();
```

## The whole flow

```ts
import { DeltaT } from "@open-tap/client";

const db = new DeltaT({
  host: "localhost",
  port: 5433,
  database: "acme",
  password: "deltat",
});

const seat = await db.resources.create({ name: "Seat 12" });

await db.rules.create([
  { resourceId: seat.id, start: 1719270000000, end: 1719280800000 },
]);

const slots = await db.availability.get({
  resourceId: seat.id,
  start: 1719270000000,
  end: 1719280800000,
});

const hold = await db.holds.place({
  resourceId: seat.id,
  start: slots[0].start,
  end: slots[0].end,
  expiresAt: Date.now() + 120000,
});

const [booking] = await db.bookings.create([
  { resourceId: seat.id, start: hold.start, end: hold.end, label: "Order #4821" },
]);

await db.close();
```

## Next steps

- **Every verb, every parameter:** the [SDK reference](/docs/sdk/reference) covers all namespaces (`resources`, `rules`, `bookings`, `holds`, `availability`, `events`), including batch reads (`getMany`) and combined availability across resources (`availability.getCombined`).
- **Run your own deltat:** [Self-host](/docs/sdk/self-host) walks through starting the single-binary server, the data directory, and the connection settings used above.
- **React to changes live:** subscribe to a resource with `events.listen` to get pushed every booking, hold, and rule change the instant it happens.

```ts
const stop = await db.events.listen(seat.id, (event) => {
  console.log(event);
});

// later
await stop();
```

Events bubble up the resource tree, so listening on Section A also surfaces changes to Seat 12 inside it.
