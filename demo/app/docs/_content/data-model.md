The nesting above is what Δt uses for every example in these docs: a tenant `Acme Tickets`, a resource `Stadium`, a resource `Section A` inside it, and `Seat 12` as the innermost resource that actually carries a timeline.

Space has three dimensions. Time is the fourth, and it is representable as a single line: the number line of instants in Unix time. A resource's timeline is exactly that line. Everything you put on it is a stretch of the line, and the only question Δt ever answers is where the gaps are.

## In kernel terms

The plain words above each map to one precise type in the engine. This section names them so the rest of the docs and the SDK signatures line up. Nothing new is happening here, it is the same model with the kernel's vocabulary.

### A timeline is a list of intervals

Every stretch on a timeline, regardless of what it means, is one `Interval`. Time itself is `Ms`, signed Unix milliseconds, the only time type in the kernel.

```rust
/// Unix milliseconds, the only time type.
pub type Ms = i64;

/// Half-open interval `[start, end)`.
pub struct Span {
    pub start: Ms,
    pub end: Ms,
}

/// What an interval represents.
pub enum IntervalKind {
    NonBlocking,                       // opens availability
    Blocking,                          // closes availability
    Hold { expires_at: Ms },           // temporary reservation with expiry
    Booking { label: Option<String> }, // permanent reservation
}

/// Rules, holds, and bookings are all just intervals.
pub struct Interval {
    pub id: Ulid,
    pub span: Span,
    pub kind: IntervalKind,
}
```

A `Span` is half-open, `[start, end)`: the end instant is not part of the stretch, so two bookings that touch end-to-start do not overlap. `overlaps` is the one geometric predicate the whole engine rests on: `self.start < other.end && other.start < self.end`.

The four `IntervalKind` variants are the plain words made precise:

| Plain word | Kernel kind | Role |
| --- | --- | --- |
| open time | `NonBlocking` rule | opens a window of availability |
| blocked | `Blocking` rule | closes a window |
| booked | `Booking { label }` | a confirmed allocation |
| (a hold) | `Hold { expires_at }` | a tentative allocation with a self-destruct timer |

Rules (`NonBlocking` / `Blocking`) are the open-and-blocked layer. Allocations (`Hold` / `Booking`) are the things people place on top. A booking is permanent until cancelled. A hold counts only while `expires_at` is greater than `now`. Once it lapses it is ignored on every read, and the background reaper removes it.

### A resource carries the timeline

The innermost box in the diagram, `Seat 12`, is a `ResourceState`. Each resource owns its intervals and two scheduling parameters.

```rust
pub struct ResourceState {
    pub id: Ulid,
    pub parent_id: Option<Ulid>,
    pub name: Option<String>,
    /// Max concurrent allocations (default 1).
    pub capacity: u32,
    /// Buffer time in ms after each allocation ends (e.g. cleaning time).
    pub buffer_after: Option<Ms>,
    /// All intervals (rules + allocations), sorted by span.start.
    pub intervals: Vec<Interval>,
}
```

`parent_id` is the nesting. `Seat 12` points at `Section A`, which points at `Stadium`. That is the tree drawn above as boxes-inside-boxes.

From the SDK, you create that tree and its intervals with the real verbs:

```ts
const stadium = await db.resources.create({ name: "Stadium" });
const sectionA = await db.resources.create({ parentId: stadium.id, name: "Section A" });
const seat12 = await db.resources.create({ parentId: sectionA.id, name: "Seat 12" });

// open hours on the seat (NonBlocking rule)
await db.rules.create([{ resourceId: seat12.id, start: 1719216000000, end: 1719244800000 }]);
// a blackout (Blocking rule)
await db.rules.create([{ resourceId: seat12.id, start: 1719223200000, end: 1719226800000, blocking: true }]);
// a confirmed booking
await db.bookings.create([{ resourceId: seat12.id, start: 1719219600000, end: 1719223200000, label: "Standup" }]);
```

### Availability is derived, never stored

There is no "free" column anywhere in the engine. The fourth row of the storage diagram is computed on demand:

> availability = open windows, minus blocking rules, minus active allocations (bookings plus live holds), each allocation extended by `buffer_after`.

The read path scans a buffer-expanded window so an allocation whose buffer tail reaches into the query window still subtracts. Nothing is cached: every read re-derives.

```ts
const slots = await db.availability.get({
  resourceId: seat12.id,
  start: 1719187200000,
  end: 1719273600000,
  minDuration: 1800000, // only slots at least 30 min long
});
```

A sub-millisecond answer is a RAM-read property, not a durable-commit one: the state is in memory and availability is a tree scan, so reads do not pay for an fsync.

### Parent/child inheritance

A child resource does not restate its parent's hours. It inherits them, and the two rule kinds compose differently:

- **Open hours (`NonBlocking`) override, nearest ancestor wins.** If `Section A` sets open hours, they apply to `Seat 12` unless `Seat 12` sets its own. The closest resource up the tree that declares open hours is the one that counts.
- **Blocking accumulates.** A blackout on `Stadium`, one on `Section A`, and one on `Seat 12` all apply to `Seat 12`. Blocks add up the whole way down; none of them is overridden.

So a seat is open when some ancestor (or itself) says it is open and no ancestor (or itself) blocks it.

### Multi-slot capacity

`capacity: u32` is the maximum number of concurrent allocations on a resource. A single seat has capacity 1. A hotel room type with five identical rooms has capacity 5, modelled as one resource, not five.

Availability with capacity greater than 1 is a `+1` / `-1` sweep-line over the allocation edges: walk the timeline, add one at each allocation start, subtract one at each end, and a moment is free wherever occupancy is below capacity.

```ts
const roomType = await db.resources.create({ name: "Standard Room", capacity: 5 });
```

Capacity 1 is just the degenerate case of the same sweep: free means occupancy zero.

### buffer_after extends the effective end

`buffer_after` is turnaround time: cleaning, cooldown, a gap you want after each allocation before the next can start. It extends each allocation's effective end to `span.end + buffer`. It never moves the start, and it is not stored as a separate interval. A 30-minute clean on a one-hour booking makes that booking occupy 90 minutes of the timeline for availability and conflict purposes, all of it after the booked stretch.

```ts
const room = await db.resources.create({ name: "Room A", capacity: 1, bufferAfter: 1800000 });
```

The value is bounded at the write boundary and every `span.end + buffer` site uses saturating arithmetic, so an out-of-range buffer (including one replayed from an old WAL) cannot overflow and panic the engine.
