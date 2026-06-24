Δt stores a little and computes a lot. You tell it what exists (your resources), when each one is open, and what is already taken. It works out what is free, every time you ask, by subtracting the busy parts from the open parts. There is no separate "availability" table to keep in sync, because availability is never stored. It is derived on read.

This page covers how your data is shaped: the tenant boundary, the resource tree, the things you put on a timeline (open hours, blackouts, bookings), and the two knobs that change how a slot fills up (capacity and buffer).

## A tenant is your private database

The `database` name on your connection picks the tenant. Each tenant is fully separate: its own state, its own durable log on disk, no shared rows with anyone else. Acme Tickets gets `database: "acme"` and never sees another tenant's data, because there is nothing shared to leak.

In practice you make one client per tenant and reuse it:

```ts
import { DeltaT } from "@open-tap/client";

const db = new DeltaT({
  host: "localhost",
  port: 5433,
  database: "acme",
  password: "deltat",
});
```

When you are done, `db.close()` ends the connection pool.

## Resources nest in a tree, leaves carry the timeline

A resource is anything bookable. Resources form a parent and child tree, so Acme Tickets > Stadium > Section A > Seat 12 is just four resources, each pointing at its parent.

The leaf is where the timeline lives. Seat 12 is the thing that gets opened, blocked, and booked. The branches above it (Stadium, Section A) exist to group seats and to set rules that flow downward, as the diagram below draws out.

<!--HIERARCHY-->

Inheritance has one rule worth knowing up front, because it is not symmetric:

- **Open hours flow down by override.** A seat uses the nearest ancestor that declares open hours. If Section A says "open 7pm to 11pm," every seat under it inherits that, until a seat sets its own hours and takes over.
- **Blackouts flow down by accumulation.** Every blackout on the seat and on each ancestor above it applies. Close the whole Stadium for maintenance and every seat under it is closed too, on top of whatever each seat already had.

So a slot is open when something at or above it says open, and nothing at or above it blocks it.

Creating that tree is a few calls. `resources.create` makes one resource and returns it with a generated id. Pass `parentId` to hang it under another:

```ts
const stadium = await db.resources.create({ name: "Stadium" });
const sectionA = await db.resources.create({
  parentId: stadium.id,
  name: "Section A",
});
const seat12 = await db.resources.create({
  parentId: sectionA.id,
  name: "Seat 12",
});
```

If you are seeding many at once, `resources.createMany` sends them in one round-trip and keeps your input order, so an item can reference a parent listed earlier in the same call.

## Open hours, blackouts, and bookings

Three kinds of thing land on a leaf's timeline:

- **Open hours** say when the resource is on sale. Without them, nothing is ever free.
- **Blackouts** carve closed time out of the open hours: a maintenance window, a holiday, a private event.
- **Bookings** are confirmed allocations. A booking stays until you cancel it.

Open hours and blackouts are both "rules," and you write them with the same verb. The only difference is the `blocking` flag: leave it off for open hours, set it to `true` for a blackout.

```ts
// Open Seat 12 for tonight's window
await db.rules.create([
  { resourceId: seat12.id, start: 1_700_000_000_000, end: 1_700_014_400_000 },
]);

// Black out a slice of it
await db.rules.create([
  { resourceId: seat12.id, start: 1_700_003_600_000, end: 1_700_007_200_000, blocking: true },
]);
```

When you want to swap a resource's whole set of open hours (the "save my weekly hours" move), reach for `rules.replaceOpenHours`. It writes the new open-hours rules first and only then deletes the old ones, so a failure halfway through never leaves the resource with an empty schedule. Blackouts and bookings are left untouched.

Bookings live on their own verb. `bookings.create` takes one or many and returns them with generated ids; `bookings.cancel(id)` removes one.

## Free is what is left

You never write availability. You ask for it, and Δt computes it on the spot:

> free = open hours, minus blackouts, minus what is already taken (bookings, plus holds that have not expired)

<!--STORAGE-->

```ts
const slots = await db.availability.get({
  resourceId: seat12.id,
  start: 1_700_000_000_000,
  end: 1_700_086_400_000,
});
// slots are { start, end } pairs, the gaps that are actually bookable
```

Because it is computed fresh each time, there is nothing stale to reconcile. A hold placed a moment ago already subtracts from the answer, and an expired hold has already given its slot back. Pass `minDuration` to drop gaps shorter than you care about.

(A hold is a tentative allocation with an expiry timestamp, covered on its own page. The short version: it blocks the slot the instant it lands and frees itself if nobody confirms.)

## Capacity: how many at once

By default a resource holds one allocation at a time. Set `capacity` higher and the same resource can take that many overlapping bookings before it is full. A booking only removes a slot once occupancy reaches capacity, so capacity 50 means fifty people can hold overlapping time before the slot reads as taken. Useful for a general-admission section, a class with a fixed number of seats, or a pool of identical units behind one id.

## Buffer: turnaround after each

`bufferAfter` adds quiet time after every allocation. Book Seat 12 until 9pm with a buffer of 15 minutes and the slot stays unavailable until 9:15, even though the booking itself ended at 9. The buffer only extends the end, never the start, and it is not a separate booking you have to manage. It just makes each allocation occupy a little more of the timeline.

```ts
const cleanedSeat = await db.resources.create({
  name: "Seat 12 (with turnaround)",
  capacity: 1,
  bufferAfter: 900_000, // 15 minutes in ms
});
```

## A few conventions to internalize

- **Time is integer Unix milliseconds.** Every `start`, `end`, and expiry is a plain number, not a date string.
- **Intervals are half-open, `[start, end)`.** The end instant is excluded, so a booking ending at 9:00 and one starting at 9:00 do not overlap. No off-by-one wars over the boundary.
- **Calendars live in your code.** Δt has no notion of timezones, weekdays, or recurrence. You expand "every Tuesday 7pm to 11pm" into concrete instants on your side, then feed it the plain numbers. The data model stays a flat number line, which is what keeps it simple.

## What is not here yet

There is no atomic "commit this hold into a booking" verb. Turning a hold into a booking today is two steps: release the hold, then create the booking. That leaves a brief window where the slot is open to someone else. If you need the slot guaranteed, keep the hold alive until the booking succeeds rather than releasing first.

For the durability, transport, and self-host details under all of this, see the [Under the hood](/docs/protocol-and-engine) page.
