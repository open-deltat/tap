This page takes you from nothing to a confirmed booking with as little ceremony as possible, using `@open-deltat/client`, TAP's TypeScript SDK, against a running Δt node. You create resources and time rules, ask what is free, hold a slot for a moment, then confirm the booking.

We will use one running example: Acme Tickets sells seats in a stadium. The tree is Stadium, then Section A, then Seat 12. We will open Seat 12 for sale, find out when it is free, hold it, and book it.

## Install

```bash
bun add @open-deltat/client
```

```ts
import { DeltaT } from "@open-deltat/client";
```

## Connect

One `DeltaT` instance is one connection to one tenant. The `database` you pass is the tenant: pick a name and that tenant's data is isolated from the rest. Create the client once and reuse it.

```ts
const db = new DeltaT({
  host: "localhost",
  port: 5433,
  database: "default",
  password: "deltat",
});
```

Those four values are the defaults, so locally you can write `new DeltaT()` and get exactly the same thing.

A note on how this connects: Δt speaks the PostgreSQL wire protocol, so under the hood TAP rides a normal Postgres driver. That is purely how the bytes get there. You never write SQL. You call typed verbs like `resources.create` and `availability.get`, and TAP turns them into the right calls for you. (There is a raw `db.sql` escape hatch if you ever need it, but reach for it only when no verb covers what you want.)

## Create a resource

A resource is anything bookable. Resources form a parent and child tree, and only the leaves carry a timeline. So Seat 12 is where the bookable time lives; Stadium and Section A are just structure above it.

```ts
const stadium = await db.resources.create({ name: "Stadium" });
const section = await db.resources.create({
  parentId: stadium.id,
  name: "Section A",
});
const seat = await db.resources.create({
  parentId: section.id,
  name: "Seat 12",
});
```

Each call returns one resource with a generated id. `capacity` defaults to 1, which is exactly right for a single seat. If you need to seed a whole tree at once, `resources.createMany` takes an array and applies the items in order, so a child can point at a parent created earlier in the same call.

## Open the hours

Nothing is bookable until you say when it is on sale. You do that with rules. A plain rule opens time; a rule with `blocking: true` closes it (a blackout). Open hours and blackouts are the two layers that shape a resource's timeline.

Here we open Seat 12 for a single match window:

```ts
await db.rules.create([
  { resourceId: seat.id, start: 1719223200000, end: 1719237600000 },
]);
```

Times are integer Unix milliseconds throughout. If you are reworking a resource's whole schedule (the "save my weekly hours" move), use `rules.replaceOpenHours`. It creates the new open-hours rules first and then deletes the stale ones, so a failure halfway through never leaves you with an empty schedule. It leaves blackouts and bookings alone.

## Ask what is free

This is the verb you will reach for most. `availability.get` does not read a stored list; it computes the free gaps on demand. It takes the open windows, subtracts blackouts, and subtracts anything already taken (bookings plus live holds), then hands back the gaps that remain.

```ts
const slots = await db.availability.get({
  resourceId: seat.id,
  start: 1719223200000,
  end: 1719237600000,
});
```

Each slot is just a `start` and an `end`. Pass `minDuration` to drop gaps shorter than you care about. Since the answer is always computed fresh, a hold placed a moment ago already shows up as taken, and an expired one already shows up as free again.

## Place a hold

A hold is a tentative grab with a built-in timer. The moment it lands, the slot is blocked for everyone else. If nobody confirms before `expiresAt`, it frees itself. This is how you stop two buyers from grabbing Seat 12 at the same instant.

```ts
const first = slots[0];
const hold = await db.holds.place({
  resourceId: seat.id,
  start: first.start,
  end: first.end,
  expiresAt: Date.now() + 5 * 60 * 1000,
});
```

`expiresAt` is an absolute Unix-ms timestamp, not a duration. You decide it; Δt stores it as given and stops counting the hold the moment that time passes.

## Confirm the booking

A booking is the permanent allocation. It stays on the timeline until you cancel it.

```ts
await db.holds.release(hold.id);
const [booking] = await db.bookings.create([
  {
    resourceId: seat.id,
    start: hold.start,
    end: hold.end,
    label: "Acme Tickets order #4012",
  },
]);
```

One honest caveat: turning a hold into a booking today is two steps, `holds.release` then `bookings.create`. There is no single commit verb yet, so there is a brief window between the two where the slot is open again. Worth knowing if you have heavy contention on the same seat.

## Close

When you are done, close the connection.

```ts
await db.close();
```

## The whole flow

Here it is end to end: open the seat, find a slot, hold it, book it, close.

```ts
import { DeltaT } from "@open-deltat/client";

const db = new DeltaT(); // localhost:5433, database "default"

const stadium = await db.resources.create({ name: "Stadium" });
const section = await db.resources.create({ parentId: stadium.id, name: "Section A" });
const seat = await db.resources.create({ parentId: section.id, name: "Seat 12" });

await db.rules.create([
  { resourceId: seat.id, start: 1719223200000, end: 1719237600000 },
]);

const slots = await db.availability.get({
  resourceId: seat.id,
  start: 1719223200000,
  end: 1719237600000,
});

const hold = await db.holds.place({
  resourceId: seat.id,
  start: slots[0].start,
  end: slots[0].end,
  expiresAt: Date.now() + 5 * 60 * 1000,
});

await db.holds.release(hold.id);
const [booking] = await db.bookings.create([
  { resourceId: seat.id, start: hold.start, end: hold.end, label: "order #4012" },
]);

await db.close();
```

That is zero to a booking. From here, two conventions carry everywhere you go next: all times are integer Unix milliseconds, and intervals are half-open `[start, end)`, so a segment that ends exactly where the next one starts does not overlap. Calendars, timezones, and recurrence stay in your own code: expand them to plain instants and feed those in.
