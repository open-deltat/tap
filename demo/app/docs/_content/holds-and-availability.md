Two people open the same seat map and both reach for Seat 12. A **hold** is how Δt makes sure only one of them gets it. It is a tentative reservation with a short timer: it blocks the slot for everyone the instant it lands, and if nobody confirms, it quietly releases itself.

This page is about holds and the thing they affect most: **availability**, which is just the answer to "what is still free." Below you can watch a hold settle a race live, then see how free time is computed, how a multi-booking either all lands or none of it does, how you ask about several resources at once, and how changes reach you the moment they happen.

## Watch a hold settle a race

Bob and Jane both want Seat 12 in Section A. Whoever places a hold first wins the slot. The other sees it disappear, in real time. Play with it:

<!--HOLDS_WIDGET-->

Placing a hold is one call. You give it a slot and a moment to expire:

```ts
const hold = await db.holds.place({
  resourceId: seat12.id,
  start: 1719216000000,
  end: 1719219600000,
  expiresAt: Date.now() + 120_000, // self-expires in two minutes
});

// Bob changes his mind. Release it now, or just let the timer fire.
await db.holds.release(hold.id);
```

A hold counts against availability only while its `expiresAt` is still in the future. Once that moment passes, the slot is free again on the very next read, whether or not anything has cleaned the hold up yet. (A background sweep does eventually remove stale holds so the list stays small, but you never wait on it.)

One thing worth knowing: **the expiry time is whatever the caller sends.** Δt trusts it and stores it as-is. It does not shorten a long timer or invent one for you. If you pass a far-future `expiresAt`, the slot stays held that long, so pick a window that matches how long a checkout should reasonably take.

## How "what is free" gets computed

Availability is never stored. Every time you ask, Δt computes the gaps fresh. The rule is short:

> free is what is open, minus what is blocked, minus what is taken.

In practice that means: start with the open hours, subtract any blackout windows, then subtract the active allocations (confirmed bookings and live holds). If a resource has a buffer (turnaround time after each allocation), that buffer extends the tail of each allocation, so the gap right after a booking stays blocked for cleanup or reset. A resource can also hold more than one thing at once if its capacity is above one, in which case a moment counts as free until it fills up.

Because nothing is cached, the answer is always current. A hold placed a millisecond ago already shrinks the next result. A hold that just expired already gives its slot back. There is no cache to invalidate.

Reading availability for one resource:

```ts
const slots = await db.availability.get({
  resourceId: seat12.id,
  start: 1719187200000,
  end: 1719273600000,
  minDuration: 1_800_000, // optional: ignore gaps shorter than 30 minutes
});
```

You get back a list of free slots, each with a `start` and `end`, for the window you asked about. `minDuration` is handy when a sliver of free time is useless to you and you only care about gaps long enough to actually book.

## Batch bookings are all-or-nothing

Sometimes one purchase is really several bookings at once: two seats, or a seat plus parking. You want them to land together or not at all. Hand `bookings.create` an array and that is exactly what happens:

```ts
const created = await db.bookings.create([
  { resourceId: seat12.id, start: 1719216000000, end: 1719219600000, label: "A1" },
  { resourceId: seat13.id, start: 1719216000000, end: 1719219600000, label: "A2" },
]);
// both rows exist, or neither does
```

Δt checks the whole batch first. If any single item conflicts with something already booked (or with another item in the same batch), the entire request is rejected and nothing is written. You never end up holding seat 12 but not seat 13. Batches do have an upper size limit, so this is for grouping a real order, not for bulk-loading thousands of rows in one shot.

## Asking across several resources at once

Often the question is not "is this exact seat free" but "is anything free." Δt can answer that across a set of resources in one call, and you decide what "free" should mean:

- **All free:** every resource open at the same moment. This is the default.
- **Any free (a pool):** at least one resource open. Good for "any of these three rooms."
- **At least k free:** at least k of them open at once.

```ts
// Any one of these rooms free at the same time (a pool):
const pool = await db.availability.getCombined({
  resourceIds: [roomA.id, roomB.id, roomC.id],
  start: 1719187200000,
  end: 1719273600000,
  minAvailable: 1, // 1 = any, default = all, k = at least k
});
```

Combined slots come back as one merged timeline with no resource id attached, because the answer is about the group, not any single member. When you instead want each resource's own slots in a single round-trip, reach for `getMany`, which keeps every result tagged by id:

```ts
const byRoom = await db.availability.getMany({
  resourceIds: [roomA.id, roomB.id],
  start: 1719187200000,
  end: 1719273600000,
});
// Record<resourceId, AvailabilitySlot[]>
```

## Live updates, the moment something changes

You do not have to poll to keep a seat map fresh. Subscribe to a resource and Δt pushes events the instant a hold is placed or released, or a booking is confirmed or cancelled:

```ts
const stop = await db.events.listen(seat12.id, (event) => {
  console.log(event); // hold placed/released, booking confirmed/cancelled, ...
});

// later, when you are done
await stop();
```

`listen` hands you back an async function to unsubscribe. Events also bubble up the resource tree, so a subscriber watching Section A hears about changes on every seat inside it, including Seat 12, without subscribing to each one. (Malformed event payloads are quietly skipped rather than thrown at you.)

## Turning a hold into a booking

The whole point of a hold is to reserve a slot while a customer finishes checkout, then turn it into a real booking. That conversion is one atomic call:

```ts
const { bookingId } = await db.holds.commit(hold.id, { label: "order-4417" });
```

The server does it in a single statement: the booking takes over the hold's resource and span, and the hold is consumed. The slot is never briefly free, so no competing writer can take the span the hold was protecting. If the hold is unknown, already released, or expired, the commit is rejected and you place a new hold and retry.

Do not build this out of `holds.release` followed by `bookings.create`. That was the old shape, and the instant between the two calls is exactly the window a hold exists to close.

One piece is still missing: a *multi*-hold commit, where several holds convert together or not at all. Until that ships, group what you can into a single atomic `bookings.create` batch and hold only the resource that is genuinely scarce.

All of these calls speak in plain numbers: times are integer Unix milliseconds, and a slot `[start, end)` includes its start but not its end, so two slots that touch end-to-start do not overlap. Calendars, time zones, and recurring schedules are yours to expand into plain instants before you hand them to Δt ([how that expansion works](/docs/guides/recurring-availability)).

For the applied versions of this page, see the guides on [preventing double bookings](/docs/guides/prevent-double-booking) and [hold-to-book checkout flows](/docs/guides/booking-holds).
