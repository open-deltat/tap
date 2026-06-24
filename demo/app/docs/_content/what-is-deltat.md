Δt is a database built for one job: keeping track of when things are taken and when they are free. If you have ever wired a booking system on top of a general-purpose database and ended up hand-writing overlap checks, race guards, and "is this slot still open" queries, Δt is the thing that should have existed underneath you.

It runs as a single binary with no other database behind it. You talk to it, you place bookings and holds, and you ask it what is free. That last question is the whole point, and Δt answers it fast.

## The one idea

We think about space in three dimensions. Time is the fourth, and unlike space it is just a single line. Everything that happens, happens somewhere on that line.

Once you see time as a line, the rest follows. A booking is not a fuzzy thing, it is a stretch on the line: a start instant and an end instant. Seat 12 in Section A is taken from 7pm to 10pm tonight. That is a segment with two ends. Place another segment on the same line and there are only two possibilities. Either they sit clear of each other, or they overlap. Two stretches collide when they overlap, full stop.

Δt leans all the way into this. Under the hood there is exactly one rule the whole engine rests on, the overlap test:

```
self.start < other.end && other.start < self.end
```

That is it. Conflict detection is that test. "Is this seat double-booked" is that test. Even "what is free" is the same idea run in reverse. Everything Δt does is this one comparison applied over and over, which is why it stays simple and stays quick.

One detail worth internalizing early: a stretch is half-open, written `[start, end)`. The end instant is not part of the stretch. So a 7-to-10 booking and a 10-to-midnight booking touch end to start and do not collide. Back-to-back is allowed; only genuine overlap is a conflict. Times are plain integers, Unix milliseconds, all the way through.

## Collision, drawn

Two bookings on one line of time. Drag the second one across the first and watch it flip between clear and colliding. There is no third state.

<!--COLLISION-->

That single flip is the whole conflict model, and it is the same check Δt runs under every booking, millions of times. Notice that back-to-back is fine: because the end instant is not part of a stretch, two bookings that touch end to start do not collide. Only a genuinely shared moment does.

## Asking what is free

Most booking bugs come from storing availability and letting it drift out of sync with reality. Δt does not store availability at all. It is never a column you update, it is an answer computed the moment you ask.

The math is the obvious one once time is a line. Take the windows where a resource is open, subtract the blackout spans, then subtract everything currently allocated (confirmed bookings plus any live holds). What is left over are the gaps. The gaps are the availability.

```ts
const free = await db.availability.get({
  resourceId: seat12,
  start: tonight7pm,
  end: tonightMidnight,
});
// free is the leftover stretches: the open windows minus what is taken
```

Because nothing is cached, the answer is always honest. A hold placed a moment ago is already subtracted. A hold that just expired has already given its slot back. You never reconcile, you just ask again.

This is also why it is fast. There is no query planner unfolding joins, no availability table to scan. It is a small amount of arithmetic over a sorted list of stretches, done in memory, so reads stay quick even under load.

## What you can put on the line

A resource is anything bookable, and resources form a tree. Acme Tickets owns a Stadium, the Stadium has Section A, Section A has Seat 12. Only the leaves carry an actual timeline, and rules flow down the tree: open hours set on the Stadium reach the seats, a blackout on Section A closes every seat under it.

On a resource's timeline you place two layers of things:

- Rules say when a resource is open or closed. Open-hours declare when something is on sale; blackouts close it. This is how you say "Section A is on sale Friday night, closed for maintenance Monday."
- Allocations are the actual claims on time. A booking is a confirmed claim that stays until you cancel it. A hold is a tentative claim with a self-destruct timer: it blocks the slot for everyone the instant it lands, and if nobody confirms before its expiry, it quietly frees itself. That is how Δt settles the race when two people grab Seat 12 at the same second.

Resources also carry a couple of knobs. Capacity lets one resource hold more than one allocation at a time (a section with room for many, not a single seat). Buffer time extends each allocation's tail, so a slot stays blocked for cleanup or turnaround after the booking technically ends.

A taste of the verbs:

```ts
const hold = await db.holds.place({
  resourceId: seat12,
  start: free[0].start,
  end: free[0].end,
  expiresAt: Date.now() + 2 * 60 * 1000, // give the buyer two minutes
});

const [booking] = await db.bookings.create([
  { resourceId: seat12, start: hold.start, end: hold.end, label: "Acme order #4417" },
]);
```

## What is not built yet

Two honest gaps worth knowing up front.

There is no single "commit this hold into a booking" verb. Today you release the hold and then create the booking as two separate steps, which leaves a small window where the slot looks free in between. If that window matters for your use case, plan around it.

And the way you connect today is the PostgreSQL wire protocol, which is transitional. A framed protocol with HTTP and MCP adapters is on the roadmap but does not exist yet, so for now you reach Δt the same way you would reach a Postgres database.

## Where to go next

To see exactly what lives on the line (resources, rules, bookings, capacity, buffers, and how the tree composes), read the data model.

To actually build against it in TypeScript, head to the tap side: the `@open-tap/client` SDK wraps all of this in plain verbs (resources, rules, holds, bookings, availability) so you never write the overlap check yourself.
