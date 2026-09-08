A double booking is not a data bug. It is a race: two requests both checked that a slot was free, both were told yes, and both wrote. The check was correct each time. The problem is the gap between checking and writing.

This page walks through where that gap comes from, the standard ways to close it, and how Δt closes it by making the check and the write the same operation.

## The race, spelled out

Nearly every booking system starts as some version of this:

```
1. read:  is Seat 12 free from 7pm to 10pm?   -> yes
2. think: user confirms, payment settles, code runs
3. write: INSERT the booking
```

Two customers run this at the same moment. Both reads happen before either write, so both see "free". Both writes land. Seat 12 now belongs to two people, and no line of code did anything wrong in isolation.

The window between step 1 and step 3 can be milliseconds or minutes. Its size changes how often you get burned, never whether you can. Under load, on popular slots (the on-sale minute, the last table on Friday), it stops being rare.

## The standard fixes

If you are building on a general-purpose database, you have three honest options.

**Make the slot a row and constrain it.** When bookable time is a fixed grid (30-minute appointment slots, one row per slot), a unique constraint on `(resource, slot)` does the job. The second insert violates the constraint and fails. This works well until slots stop being uniform: variable durations, overlapping ranges, and multi-slot bookings do not fit a grid.

**Constrain the range itself.** Postgres can reject overlapping ranges at the constraint level with an exclusion constraint over a range column. This is the strongest general answer inside a relational database, and it genuinely works. What it covers and where it runs out is a page of its own: [Do you need a scheduling database?](/docs/guides/scheduling-database)

**Serialize the check and the write.** Take a lock (application mutex, advisory lock, `SELECT ... FOR UPDATE` on the resource row) so only one request can be inside check-then-insert at a time. Correct when done right, and easy to get wrong the moment there is a second app server, a retry, or a code path that forgets the lock.

## How Δt closes the window

Δt removes the gap instead of guarding it. There is no separate check step: the conflict test runs inside the write, against the resource's timeline, and the write only lands if it passes. Two bookings collide when their spans overlap:

```
self.start < other.end && other.start < self.end
```

Writes to the same resource cannot interleave, so of two simultaneous attempts on Seat 12, one lands and the other gets a conflict error back. There is nothing to read first and no state you could have seen going stale in your hand. The [availability](/docs/holds-and-availability) you display is a hint for humans; the write is the decision.

```ts
// Both clients run this. Exactly one succeeds.
const [booking] = await db.bookings.create([
  { resourceId: seat12.id, start: 1719216000000, end: 1719219600000, label: "order-4417" },
]);
```

A rejected write is not a failure mode to engineer around. It is the system telling one caller the truth a moment before they would have found out anyway.

## Multi-item orders: all or nothing

A purchase is often several bookings: two seats together, a room plus a parking spot. Booking them one call at a time reopens the race in a worse form, where you win seat 12 and lose seat 13.

`bookings.create` takes an array and applies it as one atomic batch. Every item is checked against the timeline and against the other items in the same batch. One conflict anywhere rejects the whole request, and nothing is written. Batches cap at 1,000 items; this is for grouping an order, not bulk-loading.

```ts
await db.bookings.create([
  { resourceId: seat12.id, start, end, label: "A1" },
  { resourceId: seat13.id, start, end, label: "A2" },
]);
// both exist, or neither does
```

## The slower race: checkout

Write-time conflict checks settle the instant race. The longer race is human: someone picks a seat, then spends three minutes on the payment form. You cannot leave the seat open during those minutes, and you cannot book it before they pay.

That is what a hold is for: a tentative claim with a self-destruct timer that blocks the slot the instant it lands and frees itself if the buyer walks away. Holds get their own page: [What is a booking hold?](/docs/guides/booking-holds)

The end of that flow closes the same way the write does. `holds.commit` turns the hold into a booking in one atomic statement, so the slot is never briefly open between the two, and the holder cannot lose the very span the hold was protecting.

## Overbooking on purpose

Sometimes "double booked" is the requirement: a class holds twenty people, a parking zone holds fifty cars. That is not a race to prevent, it is a count to enforce, and it is a different mechanism ([capacity](/docs/guides/capacity)) rather than a loophole in this one. A resource with capacity 20 accepts overlapping bookings until twenty cover the same moment, then conflicts like a single seat would.

## See it race

The [realtime seats demo](/demos/live) is this page running live: open it in two windows, grab the same seat in both, and watch one hold land and the other lose. For the model underneath, start at [What is Δt](/docs).
