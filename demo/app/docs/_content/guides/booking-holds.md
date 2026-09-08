A booking hold is a tentative claim on a slot with a self-destruct timer. It blocks the slot for everyone the instant it is placed, and if nobody confirms it before the timer runs out, it frees itself. No cleanup job has to run for that to be true: an expired hold simply stops counting.

Every ticketing site you have used has one of these. "Your seats are reserved for 8 minutes" is a hold. This page is about what that mechanism actually is, how to size the timer, and how a hold-to-book checkout flow fits together.

## The problem holds solve

Conflict checks at write time settle the machine race: two requests, one winner, decided in microseconds ([how that works](/docs/guides/prevent-double-booking)). But most bookings are not decided in microseconds. A person picks a seat, then reads the price, types a card number, hesitates.

During those minutes the slot is in limbo. Leave it open and someone else books it out from under the buyer at the payment step, which is the single worst moment to lose it. Book it immediately and every abandoned cart becomes inventory you have to notice and claw back.

A hold is the third option: claim the slot now, tentatively, with an expiry. Committed buyers convert the hold into a booking. Everyone else does nothing, and the timer does the clawing back for them.

## The mechanics

Placing a hold is one call. You pass the slot and an absolute expiry instant:

```ts
const hold = await db.holds.place({
  resourceId: seat12.id,
  start: 1719216000000,
  end: 1719219600000,
  expiresAt: Date.now() + 8 * 60 * 1000, // 8 minutes from now
});
```

Three properties do all the work:

- **It lands like a booking.** The moment the hold exists, that span subtracts from [availability](/docs/holds-and-availability) and conflicts with any overlapping claim. First hold wins; the second caller gets a conflict, exactly as with a booking.
- **It only counts while `expiresAt` is in the future.** The instant the timer passes, the slot reads as free again on the very next query. A background sweep eventually deletes the stale record, but nothing waits on it.
- **It can be released early.** `db.holds.release(hold.id)` gives the slot back immediately, for the buyer who taps "never mind".

The expiry you send is a request. The server clamps it to its own clock plus a maximum TTL (`DELTAT_MAX_HOLD_TTL_MS`, one hour by default), so a wrong client clock or an optimistic timer cannot park a slot indefinitely. The `Hold` you get back echoes what you asked for, so read it back with `db.holds.get` when you need the effective expiry for a countdown. Inside the cap, the timer is a real decision and worth making deliberately.

## Sizing the timer

The expiry is a tradeoff you should pick deliberately.

Too short, and real buyers lose their seats mid-payment: the hold lapses while the card processor thinks, someone else grabs the slot, and your best customer gets an error on the confirmation screen. Too long, and abandoned carts sit on your inventory: a 30-minute hold on a hot showtime is 30 minutes of a sellable seat looking sold.

A useful default is your honest checkout time with a margin: measure how long paying actually takes, then add slack for the slow tail. Ticketing sites cluster around 5 to 10 minutes for a reason. If the buyer is still there when the timer gets close, release the old hold and place a fresh one rather than starting near the cap (a live hold counts as occupancy, so the release has to come first).

## The hold-to-book flow

The full checkout shape is four moves:

```ts
// 1. Show what is free
const slots = await db.availability.get({ resourceId: seat12.id, start, end });

// 2. Buyer picks a slot: claim it tentatively
const hold = await db.holds.place({
  resourceId: seat12.id,
  start: slots[0].start,
  end: slots[0].end,
  expiresAt: Date.now() + 8 * 60 * 1000,
});

// 3. Take payment while the hold blocks the slot

// 4. Convert: one atomic step, the hold becomes the booking
const { bookingId } = await db.holds.commit(hold.id, { label: "order-4417" });
```

Step 4 is a single server-side statement. The booking takes over the hold's resource and span and the hold is consumed, so the slot is never briefly free and no competing request can take the span the hold was protecting. Build it this way rather than `release` followed by `bookings.create`: that older two-call shape reopens the exact window the hold exists to close.

A commit is rejected if the hold is unknown, already released, or expired. Treat that as a real outcome, not an exception to swallow: re-read availability and offer the buyer another slot.

## Tie the hold to the session

A pattern worth stealing from the [demos](/demos/live): tie the hold's lifetime to the buyer's connection. Each demo opens a WebSocket when a seat is selected; opening the socket places the hold, a confirm message books it, and the socket closing releases it.

The effect is that abandonment frees inventory at the speed of a disconnect instead of a timer. Close the tab and the seat is back on sale in a heartbeat; the expiry remains as the backstop for connections that die without closing.

## Everyone else sees it happen

Holds only feel fair when the other buyers see them land. Subscribe to a resource and Δt pushes an event the moment a hold is placed or released on it (or on any seat under it, since events bubble up the resource tree):

```ts
const stop = await db.events.listen(sectionA.id, (event) => {
  // repaint the seat map
});
```

That is the whole loop behind a live seat map: holds claim, events broadcast, availability answers. Watch it run in the [realtime seats demo](/demos/live), then see [Holds and availability](/docs/holds-and-availability) for how holds and free time interact in detail.
