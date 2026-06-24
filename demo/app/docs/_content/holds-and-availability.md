Time is the fourth dimension, representable as a single line: the number line of Unix instants. On that one line a booking is a half-open segment `[start, end)`, a conflict is two segments overlapping, capacity is how many segments may stack on a point, and a buffer is a forced gap after a segment. A hold is the same segment wearing a self-destruct timer. Availability is the gaps between everything else.

Holds, capacity, and availability all live on one page because they are one primitive: a +1/-1 sweep over segments on the line. This page covers what a hold is, how the engine derives "what is free", how batch bookings stay atomic, how availability composes across resources, and how changes are pushed in real time.

## Holds and races

Two people, Bob and Jane, open the same live seat map. The story plays out as a tree: a shared starting state, one action, then one of three outcomes.

<!--HOLDS_WIDGET-->

Placing and releasing a hold:

```ts
const hold = await db.holds.place({
  resourceId: seat.id,
  start: 1719216000000,
  end: 1719219600000,
  expiresAt: Date.now() + 120_000, // Unix ms; the hold self-expires here
});

// Bob walks away: release early, or let the timer fire on its own.
await db.holds.release(hold.id);
```

### In kernel terms

A hold is a self-expiring tentative allocation. The kernel stores it as an `IntervalKind::Hold { expires_at }` on the resource's interval list, exactly like a `Booking`, except it carries the `expires_at` timestamp.

It counts toward availability and conflict only while `expires_at > now`. An expired hold is ignored on every read path: in `availability` (`engine/availability.rs`) the hold arm matches `Hold { expires_at } if *expires_at > now` and an expired one falls through to the `_ => {}` (no occupancy contributed); in `check_no_conflict` (`engine/conflict.rs`) an expired hold hits `Hold { expires_at } if *expires_at <= now => continue` and is skipped. No deletion is required for a hold to stop blocking, time alone is enough.

The reaper (`reaper.rs`) sweeps in the background and physically removes expired holds so the interval list does not grow without bound. Expiry semantics (a hold blocks iff `expires_at > now`) hold whether or not the reaper has run yet, because both read paths re-check the timestamp against the current clock.

## The availability model: one place, derived

Availability is never stored. It is derived on read by a sweep-line over the resource's intervals (`engine/queries.rs`, `compute_availability`). The formula is one line:

> free is open, minus blocked, minus booked.

Concretely: **open windows, minus blocking rules, minus active allocations (bookings plus live holds), each allocation extended by `buffer_after`.**

The pieces, in the order the sweep applies them:

1. **Open windows.** Non-blocking rules define when the resource can be used at all. A resource with no open-hours rules of its own inherits the nearest ancestor's (override: first ancestor with non-blocking rules wins).
2. **Minus blocking rules.** Blackout rules (blocking) are subtracted. Blocking accumulates down the tree: own blocking plus every ancestor's blocking.
3. **Minus active allocations.** Bookings, and holds whose `expires_at > now`, are subtracted as occupied. Each is extended by `buffer_after`: the effective end is `span.end + buffer_after` (turnaround time), never the start. `buffer_after` is bounded and saturating at the write boundary, so the arithmetic cannot overflow.
4. **Capacity.** `capacity` is a `u32` max-concurrent-allocations field on the resource. For `capacity > 1` the sweep is a +1/-1 occupancy count, and a moment is free while occupancy is below capacity. `capacity = 1` is the degenerate case: any overlapping allocation occupies it.

Reading availability for one resource:

```ts
const slots = await db.availability.get({
  resourceId: seat.id,
  start: 1719187200000,
  end: 1719273600000,
  minDuration: 1_800_000, // optional: only slots at least 30 min long
});
```

`get` returns `AvailabilitySlot[]` for the half-open window `[start, end)`. Because availability is derived, a live hold placed a millisecond ago already subtracts from the next read, and an expired hold already adds its slot back. There is no cache to invalidate, the gaps are recomputed each call. This is the sub-millisecond read characteristic: an in-region interval-tree query, roughly depth times ~100 ns, not a durable commit and not a cross-region round trip.

## Atomic batch bookings

Confirming several bookings as one unit is all-or-nothing. If any single booking in the batch conflicts, none are committed.

```ts
const created = await db.bookings.create([
  { resourceId: seatA.id, start: 1719216000000, end: 1719219600000, label: "A1" },
  { resourceId: seatB.id, start: 1719216000000, end: 1719219600000, label: "B1" },
]);
// either both rows exist, or neither does
```

The engine (`batch_confirm_bookings`, `engine/mutations.rs`) makes this safe across multiple resources:

1. **Sorted, deduped locks.** Resource ids are collected, sorted, and deduped, then write locks are acquired in that fixed order. A consistent lock order across all batches means two concurrent batches can never deadlock.
2. **Phase 1, validate.** Every booking is checked against current committed state with `check_no_conflict`, and intra-batch members are checked against each other (capacity-aware: on a capacity-N resource the sweep allows up to N overlapping members in one batch).
3. **Phase 2, commit.** Only if every booking validated does the engine persist and apply them. A conflict anywhere short-circuits before any write.

The batch is bounded by the kernel batch size (`MAX_BATCH_SIZE`). The atomicity that binds independent timelines together under one set of locks is the load-bearing property here, it is what lets you treat N coupled 1-D lines as a single bookable unit.

## Composing availability across resources

The same +1/-1 sweep that powers capacity also composes availability across independent resources. Per-resource free slots are fed into one sweep with a `minAvailable` threshold (`compute_multi_availability`, `engine/queries.rs`):

- `minAvailable = N` (all resources, the default) gives the **intersection**: windows where every resource is free at once.
- `minAvailable = 1` gives a **pool / union**: windows where at least one resource is free.
- `minAvailable = k` gives **at least k free** at the same moment.

```ts
// Any one of these rooms free (a pool):
const pool = await db.availability.getCombined({
  resourceIds: [roomA.id, roomB.id, roomC.id],
  start: 1719187200000,
  end: 1719273600000,
  minAvailable: 1,
});
```

Combined slots carry no `resource_id` because the set is merged into one answer. If you instead want per-resource slots in one round-trip (rows stay tagged with their id), use `getMany`:

```ts
const byRoom = await db.availability.getMany({
  resourceIds: [roomA.id, roomB.id],
  start: 1719187200000,
  end: 1719273600000,
});
// Record<resourceId, AvailabilitySlot[]>
```

Composition is topology-free: the resource axis is an opaque categorical lock key, not a metric dimension, and the same sweep runs whether the resources sit in one engine or would be federated across homes. Nothing about where the resources live changes the math.

## Real-time updates

Changes are pushed the instant they happen, over a per-resource channel named `resource_{ULID}`. Events bubble up the parent tree: a change on a child resource also notifies subscribers of its ancestors, so a subscriber watching a section sees holds and bookings on every seat inside it.

```ts
const stop = await db.events.listen(seat.id, (event) => {
  // fires on hold placed/released, booking confirmed/cancelled, etc.
  console.log(event);
});

// later
await stop();
```

`listen` returns an async unsubscribe function. Malformed payloads are silently ignored.

## Honest caveat: hold-to-confirm is not atomic today

The mental model above says a hold "becomes a real booking in one step, with no gap where anyone could slip in." That is the intended semantics and the right way to reason about the race. It is not yet what the engine does.

There is **no atomic `CommitHold` at HEAD.** A single-lock hold-to-booking transition is specified but not built. Today, turning a hold into a booking is **release-then-book**: you call `holds.release(holdId)` and then `bookings.create(...)` as two separate operations.

```ts
// NOT atomic today: a real TOCTOU window sits between these two calls.
await db.holds.release(hold.id);
await db.bookings.create([{ resourceId: seat.id, start, end, label }]);
```

Between the release and the create, the seat is genuinely free, so a competing request can slip in and take it. This is a real time-of-check-to-time-of-use window. The "one step, no gap" guarantee depends on `CommitHold`, which does not exist yet.

One related sharp edge: **hold expiry is caller-supplied, not authority-assigned.** `holds.place` takes `expiresAt` as a Unix-ms timestamp from the client. The kernel trusts and stores it; it does not impose or clamp a server-side TTL. A caller that passes a far-future `expiresAt` holds the slot for that long.
