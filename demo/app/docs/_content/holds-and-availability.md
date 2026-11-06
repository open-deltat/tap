Every booking, by an agent or a person, is the same four steps: find what is free, hold the slot you are about to offer, book it when the answer is yes, and listen so the next answer is never stale. This page takes them one at a time. The examples use the TypeScript client; the [MCP tools](/docs/quickstart) and plain SQL do the same things.

Two people reach for the same seat at the same second. Whoever holds first gets it, and the other is told no straight away:

<!--HOLDS_WIDGET-->

## Find

<!--FIND-->

Free time is never stored. Each time you ask, Δt takes the open hours, subtracts blocked time, subtracts every booking and every hold that has not expired, and returns the gaps.

```ts
const slots = await db.availability.get({
  resourceId: seat12.id,
  start: dayStart,
  end: dayEnd,
  minDuration: 30 * 60_000, // optional: skip gaps shorter than 30 minutes
});
// [{ start, end }, ...]
```

Because nothing is cached, the answer is always current: a hold placed a millisecond ago is already missing from it, and one that just expired is already back. One read covers up to 90 days.

A resource with a buffer (cleanup time after each booking) blocks that extra time too, and a resource with a capacity above one stays free until it is full. Both are on the [data model](/docs/data-model) page.

### Several calendars at once

Often the question is "when are all of these free?" or "is any of these free?". `getCombined` answers across a group:

```ts
const together = await db.availability.getCombined({
  resourceIds: [doctor.id, room.id],
  start, end,
  // minAvailable: 1 for "any one of them", k for "at least k". Default: all of them.
});
```

`getMany` answers for each resource separately in one round trip, keyed by id. The [live example](/#live) on the landing page is `getCombined` across five people.

## Hold

<!--HOLD-->

A hold claims a slot with a timer. The instant it lands, the slot is gone from everyone else's answer; if nobody books it in time, it lets go on its own.

```ts
const hold = await db.holds.place({
  resourceId: seat12.id,
  start: slot.start,
  end: slot.end,
  expiresAt: Date.now() + 5 * 60_000, // ask for five minutes
});
```

`expiresAt` is a request. The server keeps it no later than its own clock plus a cap (`DELTAT_MAX_HOLD_TTL_MS`, one hour by default), so a client with a wrong clock cannot park a slot for good. Read the hold back with `holds.get` when you need the real expiry for a countdown. A hold stops counting the moment it expires, whether or not the background sweep has removed it yet.

To hold several things together, a room and the person and the equipment, use `placeMany`: every hold lands, or none does.

```ts
const holds = await db.holds.placeMany([
  { resourceId: room.id, start, end, expiresAt },
  { resourceId: doctor.id, start, end, expiresAt },
]);
```

Changed your mind? `holds.release(id)` frees the slot straight away.

## Book

<!--BOOK-->

When the answer is yes, turn the hold into a booking. It is one step on the server: the booking takes over the hold's slot, and the slot is never free in between.

```ts
const { bookingId } = await db.holds.commit(hold.id, { label: "order-4417" });

// several holds, all of them or none:
const { bookingIds } = await db.holds.commitMany(holds.map((h) => h.id), { label: "consult" });
```

If the hold expired or was already used, the commit is refused: read again and offer the next time. Do not build this from `holds.release` followed by `bookings.create`; the moment between those two calls is exactly what a hold exists to close.

When there is nothing to ask a person, you can also book directly. `bookings.create` takes one booking or a list, and a list lands all together or not at all:

```ts
await db.bookings.create([
  { resourceId: seat12.id, start, end, label: "A1" },
  { resourceId: seat13.id, start, end, label: "A2" },
]);
```

A refusal is a normal answer, not a crash. When a booking or hold would overlap, the error carries times that still work; `counterOffer(err)` reads them. See [double bookings](/docs/guides/prevent-double-booking).

## Listen

<!--LISTEN-->

Every screen and agent can be told the moment anything changes, instead of asking again on a timer. `events.watch` gives you a plain change (`held`, `booked`, `hold_ended`, `cancelled`) and reconnects on its own:

```ts
const stop = await db.events.watch(section.id, (change) => {
  render(change);
});
// later
await stop();
```

Changes travel up the resource tree, so watching a section hears every seat in it. Treat a change as a reason to re-read rather than as the full truth: if a listener falls behind, it is told it missed some, and a fresh read always puts it right. [Live updates](/docs/guides/real-time-scheduling) has the details.

## Conventions

Times are plain integers, milliseconds since 1970. A slot `[start, end)` includes its start and not its end, so two slots that touch end to start do not overlap. Time zones, calendars and weekly patterns are expanded in your code before they reach Δt; [recurring hours](/docs/guides/recurring-availability) shows how.
