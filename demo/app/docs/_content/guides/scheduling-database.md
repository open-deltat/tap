You can build a booking system on Postgres. People do it every day, and the good ones work. This page is the honest version of the question that follows: how far does a general-purpose database take you, where does the road get steep, and what does a purpose-built time database actually change?

## The part Postgres genuinely solves

Start with the core danger, the [double booking](/docs/guides/prevent-double-booking). The naive schema loses that race, but Postgres has a real answer: range types plus an exclusion constraint.

```sql
CREATE EXTENSION btree_gist;

CREATE TABLE bookings (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  resource_id bigint NOT NULL,
  during      tstzrange NOT NULL,
  EXCLUDE USING gist (resource_id WITH =, during WITH &&)
);
```

That constraint rejects any insert whose range overlaps an existing booking on the same resource, at the database level, no matter which code path writes. Postgres ranges are even half-open `[)` by default, the same convention Δt uses, so back-to-back bookings compose correctly.

Give credit where due: for one resource type, uniform bookings, and modest traffic, this is a fine foundation. If that describes your problem, use it.

## Where the road gets steep

Overlap rejection is one feature of a scheduling system. The rest arrive as tickets, and each one is buildable and none is free.

**Availability is the absence of rows.** SQL answers "what exists"; a booking page asks "what does not". Computing the free gaps means assembling open hours, subtracting blackouts, bookings, and live holds, and returning the remainder, per resource, per query. In SQL that becomes a slot-grid table you join against, or window functions over sorted intervals, and it sits in your hottest read path. In Δt this is [the primitive](/docs): availability is derived on every read by construction, never stored, so there is nothing to precompute or drift.

**Holds decay, rows do not.** A checkout [hold](/docs/guides/booking-holds) must block the slot now and evaporate on its own. With a `holds` table, every availability read and every conflict check must filter `expires_at > now()`, including the exclusion constraint, which cannot see expiry on its own. Then something has to delete the corpses. Each piece is small; the combination is a background job, a partial-index strategy, and a class of bugs where one query forgot the filter.

**Capacity is not pairwise.** An exclusion constraint compares two rows. "[At most 20 overlapping](/docs/guides/capacity)" is a property of a whole set of rows at an instant, which pushes you into triggers that count under serialization, or advisory locks around every write to the class. This is the point where most teams quietly move conflict logic back into the application, and the race comes back with it.

**Buffers, trees, and events.** [Turnaround time](/docs/guides/buffer-time) means inflating every range on write or indexing an expression over it. Resource hierarchies (venue, section, seat) mean recursive CTEs in the read path. Live seat maps mean triggers serializing JSON into `NOTIFY`. All standard Postgres, all yours to write and keep correct together.

Any one of these is a weekend. The sum is a scheduling engine, implemented as constraints, triggers, jobs, and application conventions spread across a codebase, and it is the part of your product your users blame when two of them get the same table.

## What a time database changes

Δt is that engine extracted into its own process, built around one model instead of assembled around a table. A booking is a span on the Unix-time number line; a conflict is an overlap; capacity is a count at an instant; a buffer stretches a span's tail; a hold is a span with an expiry the engine itself respects; availability is the gaps, computed fresh on every read. The checks run inside the write on an in-memory timeline, durable through an append-only log, [one binary with no database underneath](/docs/protocol-and-engine).

None of those features is a bolt-on, because the data model was never rows-first. That is the actual difference. Postgres can be assembled into a scheduling engine; Δt starts as one, so there is nothing to assemble and no way for the pieces to disagree.

It also stays in its lane. Δt stores no prices, no users, no business data, and it does not replace your Postgres; it stands next to it and owns the timeline, referenced by resource id. It speaks the Postgres wire protocol today, so [any Postgres client connects](/docs/guides/postgres-wire), and the [TypeScript SDK](/docs/sdk/quickstart) gives the model to you as typed verbs.

## Choose with your actual load

Stay on plain Postgres when bookings are one table among many, contention is low, slots fit a uniform grid, and you need bookings inside the same transaction as payments or business rows. The exclusion constraint is good engineering; a second system is a real cost, and boring wins.

Reach for a time database when the scheduling itself is the product: contention on the same slots, availability queries dominating reads, hold-to-book checkout flows, capacity counting, live updates to many watchers. That is the load Δt exists for, and every [demo on this site](/) is that load running live.
