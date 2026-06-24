Δt is the database for time. tap is how you use it. They are two pieces on purpose, and the split between them is the whole idea.

Δt is the engine: it stores stretches of time, works out when they collide, and answers what is free, fast. tap is the small typed TypeScript client you actually hold in your hands: one class, a handful of namespaces, plain async methods. You give it resources and time rules, and it answers the question that matters, what is available right now and can I grab it before someone else does.

## Why it complements Δt

The two pieces divide the work cleanly, and that division is the point of having both.

Δt is the kernel, and it is deliberately narrow. It has one job: keep stretches of time, detect when they overlap, and compute the gaps that are left. To stay that fast and that correct, it knows nothing about humans. It deals only in plain integer instants, Unix milliseconds on a single line. No timezones, no daylight saving, no notion of "every Tuesday."

tap is the edge, and it is where the human world lives. Two kinds of thing belong here. First, ergonomics: typed verbs, so you call `availability.get` and `holds.place` instead of writing SQL or hand-rolling a wire protocol. Second, everything messy that Δt refuses to hold: timezones, calendars, recurring schedules, display formatting. You expand all of that into plain instants in your own code, then hand the numbers down.

That is why they fit together. The database stays small, fast, and correct because it never has to guess what a human meant. The human complexity stays in your code, where it can change as fast as your product does without ever touching the engine. You get a kernel simple enough to trust and a client rich enough to build on.

So if you have a weekly schedule, you expand it into concrete spans on your side and hand the database plain instants. If you want to show a time in someone's local zone, you format it on the way out. tap does ship a few helpers for the expansion work (turning a recurrence into concrete spans, day-of-week math), but they sit outside the core verb surface on purpose: they help you build the spans, they are not part of how you talk to the database.

## The mental model: time is a 1D line

There is one idea to internalize, and everything else follows from it.

Time is a single number line. Every instant is an integer count of Unix milliseconds. Anything you place on a resource is a span on that line, written half-open as `[start, end)`. The start is included, the end is not, so two spans that touch end-to-start (one ends at `200`, the next starts at `200`) do not overlap. That one rule is what makes "is this slot free" a clean geometry question instead of a pile of edge cases.

So a booking is a span. A hold is a span with an expiry. Open hours are spans. Blackouts are spans. Availability is just the open spans with the taken ones subtracted out. Just numbers on a line.

## What you actually work with

You create one client per database and reuse it.

```ts
import { DeltaT } from "@open-tap/client";

const db = new DeltaT({
  host: "localhost",
  port: 5433,
  database: "default",
  password: "deltat",
});
```

The `database` value is also your tenant: point two clients at different database names and they get fully separate worlds. When you are done, `await db.close()` ends the connection pool.

From there you work through six namespaces, each one a small bundle of verbs:

- **`db.resources`** is anything bookable, arranged in a parent and child tree where only the leaves carry a timeline. Think Acme Tickets, then Stadium, then Section A, then Seat 12. Only the seat actually holds spans. `create` makes one and hands back a generated id; `createMany` seeds a whole batch in order so a child can name a parent created earlier in the same call. Capacity defaults to 1.
- **`db.rules`** lays down the timeline shape: open-hours spans (when something is on sale) and blackout spans (when it is closed). There is also a `replaceOpenHours` verb that swaps a resource's open hours for a new set safely, creating the new ones first and only then removing the stale ones, so the schedule is never empty in the middle of a change. Your blackouts and bookings are left untouched.
- **`db.bookings`** is a confirmed allocation on the timeline. `create` takes one or many, `cancel` removes one, and an optional `label` rides along.
- **`db.holds`** is a tentative allocation with a self-destruct timer. You give it an `expiresAt` (an absolute Unix-millisecond instant), and it blocks the slot for everyone the moment it lands, then frees itself if nobody confirms. This is how two callers reaching for Seat 12 at the same time get sorted out: the first hold wins, the second sees the slot taken.
- **`db.availability`** is the derived answer. Nothing is stored; it is computed on every read as open windows minus blackouts minus everything currently taken. `get` answers for one resource, `getCombined` merges several into one timeline, and `getMany` answers for several at once without merging them.
- **`db.events`** is the live feed. `listen` subscribes to changes on a resource and returns an unsubscribe function. Changes bubble up the tree, so a listener on Section A hears about Seat 12.

A small end-to-end flow reads about how you would expect: ask what is free, hold the first slot, then confirm it.

```ts
const slots = await db.availability.get({
  resourceId: seat12,
  start: gateOpen,
  end: gateClose,
});

const hold = await db.holds.place({
  resourceId: seat12,
  start: slots[0].start,
  end: slots[0].end,
  expiresAt: Date.now() + 2 * 60 * 1000,
});

await db.holds.release(hold.id);
await db.bookings.create([
  { resourceId: seat12, start: hold.start, end: hold.end, label: "order-4417" },
]);
```

## What is not built yet

Two honest notes so nothing surprises you.

There is no single "commit this hold" verb yet. Turning a hold into a booking today is two steps: release the hold, then create the booking. Those are not one atomic action, so there is a brief window between them where the slot is technically free. For a lot of use cases that window is fine; just know it is there.

And the transport underneath tap is currently the PostgreSQL wire protocol, which is why the client wraps a postgres connection (`db.sql` is exposed as an escape hatch, but reach for it only when no verb covers your need). This is transitional. Framed HTTP and MCP adapters are planned but do not exist today.

## A couple of conventions to keep in your head

- Every time value is an integer count of Unix milliseconds. No `Date` objects on the wire, no strings, no zones. Convert at the edge.
- Every interval is half-open `[start, end)`. Touching is not overlapping.
- Anything human (timezones, calendars, recurrence, formatting) is your job, in your code. Expand it to plain spans, then hand those to tap.

## Where to go next

- **Quickstart** to install, connect, and run the availability to hold to booking flow start to finish.
- **SDK reference** for every namespace, verb, and option, written out in full.
- **Self-host** to run Δt yourself: it is a single binary, no Postgres underneath, configured entirely through environment variables.
