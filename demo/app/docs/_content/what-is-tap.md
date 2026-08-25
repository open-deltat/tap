TAP is the Time Allocation Protocol: one shared way to describe and access time, scheduling, booking, and availability, so any app, service, or agent can ask the same question, what is free, and can I claim it before someone else does.

That makes TAP a protocol in its own right, not a library and not a database. It is a small, open model of time allocation (resources that hold time, rules that open and close it, holds and bookings that claim it, and availability as whatever is left) together with a set of verbs for reading and changing that state over a connection. Anything that speaks TAP can be talked to the same way. You meet it in practice as `@open-deltat/client`, a typed TypeScript SDK, but the model is the point, and the model is portable.

## A protocol, not a database

TAP describes time and how to reach it. It does not store anything itself. To actually do something, you point a TAP client at a running node that speaks the protocol, some backend that holds the state and answers your reads and writes. This page assumes you already have one running somewhere.

That backend is a separate thing from tap. [Δt](/docs) is the one built for the job, a single binary that answers "what is free?" fast, and it has its own page. But TAP is the language and Δt is one thing that speaks it. Keeping them apart is deliberate: TAP is a way to talk about time that does not depend on any one database, and in principle you could point the same client at any backend that implements the protocol without changing your code.

## The model: time is a 1D line

There is one idea underneath everything TAP describes.

Time is a single number line. Every instant is an integer count of Unix milliseconds. Anything you place is a span on that line, written half-open as `[start, end)`. The start is included, the end is not, so two spans that touch end-to-start (one ends at `200`, the next starts at `200`) do not overlap. That one rule is what turns "is this slot free" into a clean geometry question instead of a pile of edge cases.

So a booking is a span. A hold is a span with an expiry. Open hours are spans. Blackouts are spans. Availability is just the open spans with the taken ones subtracted out. Scheduling, booking, and availability are all the same handful of shapes on one line, which is the whole reason TAP can be a single small protocol instead of a sprawling API.

## How you access it

You open one client per backend and reuse it. Assuming a node is already running:

```ts
import { DeltaT } from "@open-deltat/client";

const db = new DeltaT({
  host: "localhost",
  port: 5433,
  database: "default",
  password: "deltat",
});
```

The `database` value is also your tenant: point two clients at different database names and they get fully separate worlds. When you are done, `await db.close()` ends the connection pool.

From there you work through six namespaces, each a small bundle of verbs:

- **`db.resources`** is anything bookable, arranged in a parent and child tree where only the leaves carry a timeline. `create` makes one and hands back a generated id; `createMany` seeds a whole batch in order so a child can name a parent created earlier in the same call. Capacity defaults to 1.
- **`db.rules`** lays down the timeline shape: open-hours spans (when something is on sale) and blackout spans (when it is closed). `replaceOpenHours` swaps a resource's open hours for a new set safely, creating the new ones first and only then removing the stale ones, so the schedule is never empty mid-change.
- **`db.bookings`** is a confirmed allocation on the timeline. `create` takes one or many, `cancel` removes one, and an optional `label` rides along.
- **`db.holds`** is a tentative allocation with a self-destruct timer. You give it an `expiresAt` (an absolute Unix-millisecond instant), and it blocks the slot for everyone the moment it lands, then frees itself if nobody confirms. The first hold wins; the second caller sees the slot taken.
- **`db.availability`** is the derived answer, never stored: open windows minus blackouts minus everything currently taken. `get` answers for one resource, `getCombined` merges several into one timeline, and `getMany` answers for several at once without merging them.
- **`db.events`** is the live feed. `listen` subscribes to changes on a resource and returns an unsubscribe function. Changes bubble up the tree, so a listener on a section hears about every seat inside it.

A small end-to-end flow reads about how you would expect: ask what is free, hold the first slot, then confirm it.

```ts
const slots = await db.availability.get({ resourceId: seat, start: gateOpen, end: gateClose });

const hold = await db.holds.place({
  resourceId: seat,
  start: slots[0].start,
  end: slots[0].end,
  expiresAt: Date.now() + 2 * 60 * 1000,
});

await db.holds.release(hold.id);
await db.bookings.create([{ resourceId: seat, start: hold.start, end: hold.end, label: "order-4417" }]);
```

## Humans live at the edge

TAP deals only in plain Unix-millisecond instants. It does not know what a timezone is, it has never heard of daylight saving, and it does not expand "every Tuesday" into actual Tuesdays. All of that, every timezone conversion, every calendar, every recurring schedule, every bit of display formatting, lives in your code, at the edge, in TAP's world.

So if you have a weekly schedule, you expand it into concrete spans on your side and hand the backend plain instants. If you want to show a time in someone's local zone, you format it on the way out. The protocol stays small and the backend stays fast because neither has to guess what a human meant. TAP does ship a few helpers for the expansion work (turning a recurrence into concrete spans, day-of-week math), but they sit outside the core verb surface on purpose: they help you build the spans, they are not part of how you talk to a node.

## What is not built yet

Two honest notes so nothing surprises you.

There is no single "commit this hold" verb yet. Turning a hold into a booking today is two steps: release the hold, then create the booking. Those are not one atomic action, so there is a brief window between them where the slot is technically free. For a lot of use cases that window is fine; just know it is there.

And the transport today is the PostgreSQL wire protocol, which is why the client wraps a postgres connection (`db.sql` is exposed as an escape hatch, but reach for it only when no verb covers your need). This is transitional. Framed HTTP and MCP adapters are planned but do not exist yet.

## A couple of conventions to keep in your head

- Every time value is an integer count of Unix milliseconds. No `Date` objects on the wire, no strings, no zones. Convert at the edge.
- Every interval is half-open `[start, end)`. Touching is not overlapping.
- Anything human (timezones, calendars, recurrence, formatting) is your job, in your code. Expand it to plain spans, then hand those to a node.

## Where to go next

- **[Quickstart](/docs/sdk/quickstart)** to install the SDK, connect to a node, and run the availability to hold to booking flow start to finish.
- **[SDK reference](/docs/sdk/reference)** for every namespace, verb, and option, written out in full.
- **[Self-host](/docs/sdk/self-host)** to stand up a node of your own: Δt is a single binary, no Postgres underneath, configured entirely through environment variables.
- **The guides** for the problems these verbs exist to solve: [double bookings](/docs/guides/prevent-double-booking), [holds](/docs/guides/booking-holds), [capacity](/docs/guides/capacity), [recurring availability](/docs/guides/recurring-availability).
