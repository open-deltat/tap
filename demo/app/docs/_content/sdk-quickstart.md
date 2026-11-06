This page takes you from nothing to a confirmed booking in code, using `@open-deltat/client`, the TypeScript SDK, against a running Δt ([self-host](/docs/sdk/self-host) shows how to start one). You create resources and open hours, ask what is free, hold a slot, then book it. If you only want an agent to book, the [agent quickstart](/docs/quickstart) needs no code at all.

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
  database: "acme",
  password: process.env.DELTAT_PASSWORD,
});
```

Host and port default to `localhost` and `5433`. Always pass the password you started Δt with: a server started without one makes up a random password at each start and prints it once.

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

`expiresAt` is an absolute Unix-ms timestamp, not a duration. The server keeps it no later than its own clock plus a cap (one hour by default), so read the hold back with `holds.get` if you show a countdown. The hold stops counting the moment it expires.

## Confirm the booking

When the buyer says yes, turn the hold into a booking. It is one step on the server, so the seat is never free in between:

```ts
const { bookingId } = await db.holds.commit(hold.id, { label: "Acme Tickets order #4012" });
```

The booking stays on the timeline until you cancel it. If the hold already expired, the commit is refused: read availability again and offer the next seat.

## Close

When you are done, close the connection.

```ts
await db.close();
```

## The whole flow

Here it is end to end: open the seat, find a slot, hold it, book it, close.

```ts
import { DeltaT } from "@open-deltat/client";

const db = new DeltaT({ database: "acme", password: process.env.DELTAT_PASSWORD }); // localhost:5433

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

const { bookingId } = await db.holds.commit(hold.id, { label: "order #4012" });

await db.close();
```

That is zero to a booking. From here, two conventions carry everywhere you go next: all times are integer Unix milliseconds, and intervals are half-open `[start, end)`, so a segment that ends exactly where the next one starts does not overlap. Calendars, timezones, and recurrence stay in your own code: expand them to plain instants and feed those in.
