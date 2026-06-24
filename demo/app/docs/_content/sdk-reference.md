The complete verb surface of the tap TypeScript SDK, on one page, grouped by namespace. One entry per verb: signature, what it does, and a runnable example. This page is built from the real verb surface and nothing else, so it cannot drift.

If a method is not listed here, it is not part of the verb surface. The recurrence helpers (`expandRecurrence`, `RecurrencePattern`, `ExplicitSegment`, `RuleSegment`) and the schedule-era time/mask helpers (`daysOfWeekMask`, `timeToMinutes`, `DayName`, and friends) are intentionally excluded. For recurring open hours, expand on your side and call `rules.replaceOpenHours` or `rules.create` with pre-expanded segments (see [Recurring hours](#recurring-hours) below).

## Conventions

These three rules hold across every verb. They are stated once here and assumed everywhere below.

- **Half-open intervals.** Every span is `[start, end)`: the start instant is included, the end instant is not. Two spans collide when they cover the same moment, so `[10:00, 11:00)` and `[11:00, 12:00)` do not collide. A booking is a half-open segment on the number line of Unix time; a conflict is two segments overlapping on that one line.
- **Unix milliseconds.** Every `start`, `end`, and `expiresAt` is an integer Unix timestamp in milliseconds. The kernel deals only in integer instants. Timezones, calendars, and display all live at the edge (in your code), never in the database.
- **Batch atomicity.** Verbs that take an array (`resources.createMany`, `rules.create`, `bookings.create`) apply all-or-nothing in one round-trip. A batch that would conflict is rejected whole; nothing partial is written.

## Setup

```ts
import { DeltaT } from "@open-tap/client";

const db = new DeltaT({ host: "localhost", port: 5433, database: "acme", password: "deltat" });
```

---

## client

The connection. Construct one `DeltaT` per database (tenant) and reuse it.

### constructor

```ts
constructor(options?: DeltaTOptions | Sql)
```

Construct a DeltaT client, either from connection options (host/port/database/username/password) or by wrapping an existing postgres `Sql` instance.

```ts
const db = new DeltaT({ host: "localhost", port: 5433, database: "acme", password: "deltat" });
```

### close

```ts
async close(): Promise<void>
```

Close the underlying postgres connection pool.

```ts
await db.close();
```

---

## resources

A resource is anything you can book. Resources form a parent/child tree: a resource can hold other resources, and only the leaves carry a timeline. Children inherit open hours from ancestors (non-blocking overrides, nearest ancestor wins; blocking accumulates).

### create

```ts
async create(opts?: { parentId?: string | null; name?: string | null; capacity?: number; bufferAfter?: number | null; }): Promise<Resource>
```

Create one resource (capacity defaults to 1, `parentId`/`name`/`bufferAfter` default to null) and return it with its generated ulid id.

```ts
const room = await db.resources.create({ name: "Room A", capacity: 4 });
```

### createMany

```ts
async createMany(items: { parentId?: string | null; name?: string | null; capacity?: number; bufferAfter?: number | null; }[]): Promise<Resource[]>
```

Create several resources in one round-trip, applied in input order, so an item may reference a parent created earlier in the same call (parent-first ordering). Bounded by the kernel batch size of 1000.

```ts
const [building, floor] = await db.resources.createMany([{ name: "HQ" }, { name: "Floor 1" }]);
```

### update

```ts
async update(id: string, opts: { name?: string | null; capacity?: number; bufferAfter?: number | null; }): Promise<void>
```

Update a resource's name, capacity, and/or bufferAfter. Only provided fields are written; a no-op if none are given.

```ts
await db.resources.update(room.id, { capacity: 6 });
```

### delete

```ts
async delete(id: string): Promise<void>
```

Delete a resource by id.

```ts
await db.resources.delete(room.id);
```

### get

```ts
async get(filter?: { parentId: string } | { roots: true }): Promise<Resource[]>
```

List resources: all when no filter, only top-level (`parent_id IS NULL`) with `{ roots: true }`, or direct children with `{ parentId }`.

```ts
const roots = await db.resources.get({ roots: true });
```

---

## rules

A rule is an open or closed region of a resource's timeline. An open-hours rule (`blocking` false or omitted) adds available time; a blackout rule (`blocking: true`) removes it. Availability is open windows minus blocking rules minus active allocations.

### create

```ts
async create(items: { resourceId: string; start: number; end: number; blocking?: boolean; }[]): Promise<Rule[]>
```

Create one or many rules in one round-trip. Open-hours when `blocking` is false or omitted, blackout when `blocking` is true. Returns the created rules with generated ulid ids.

```ts
await db.rules.create([{ resourceId: room.id, start: 1719216000000, end: 1719244800000 }]);
```

### replaceOpenHours

```ts
async replaceOpenHours(resourceId: string, segments: { start: number; end: number }[]): Promise<Rule[]>
```

Replace a resource's non-blocking (open-hours) rules with new segments. Creates the new rules first, then deletes the stale ones, so a mid-run failure never leaves an empty schedule. Blocking rules and bookings are untouched.

```ts
await db.rules.replaceOpenHours(room.id, [{ start: 1719216000000, end: 1719244800000 }]);
```

### update

```ts
async update(id: string, opts: { start: number; end: number; blocking: boolean }): Promise<void>
```

Replace a rule's span and blocking flag. All three fields are required.

```ts
await db.rules.update(rule.id, { start: 1719216000000, end: 1719241200000, blocking: false });
```

### delete

```ts
async delete(id: string): Promise<void>
```

Delete a rule by id.

```ts
await db.rules.delete(rule.id);
```

### get

```ts
async get(resourceId: string): Promise<Rule[]>
```

List all rules for a resource.

```ts
const rules = await db.rules.get(room.id);
```

---

## bookings

A booking is a confirmed allocation: a half-open segment placed on a resource's timeline. It counts against availability and collides with any overlapping allocation.

### create

```ts
async create(items: { resourceId: string; start: number; end: number; label?: string; }[]): Promise<Booking[]>
```

Create one or many bookings in one round-trip and return them with generated ulid ids. An empty input returns an empty array. The batch is atomic.

```ts
const [b] = await db.bookings.create([{ resourceId: room.id, start: 1719216000000, end: 1719219600000, label: "Standup" }]);
```

### cancel

```ts
async cancel(id: string): Promise<void>
```

Cancel (delete) a booking by id.

```ts
await db.bookings.cancel(b.id);
```

### get

```ts
async get(resourceId: string, filter?: { start?: number; end?: number }): Promise<Booking[]>
```

List bookings for a resource. When both `filter.start` and `filter.end` are given, return only bookings overlapping the half-open window `[start, end)`.

```ts
const today = await db.bookings.get(room.id, { start: 1719187200000, end: 1719273600000 });
```

### getMany

```ts
async getMany(resourceIds: string[]): Promise<Record<string, Booking[]>>
```

Fetch bookings for many resources in one round-trip, grouped by resource id. Every requested id is present in the result (an empty array if it has none).

```ts
const byRoom = await db.bookings.getMany([roomA.id, roomB.id]);
```

---

## holds

A hold is a self-expiring tentative allocation: a segment with a self-destruct timer. It marks a slot taken for everyone the instant it is placed, and it lets go on its own at `expiresAt` if nobody confirms. That tiny timer is what settles a race between two callers grabbing the same slot. A hold counts toward availability and conflict only while `expiresAt > now`; expired holds are ignored by the reaper.

### place

```ts
async place(opts: { resourceId: string; start: number; end: number; expiresAt: number; }): Promise<Hold>
```

Place a single hold that auto-expires at `expiresAt` (Unix ms) and return it with a generated ulid id.

```ts
const hold = await db.holds.place({ resourceId: room.id, start: 1719216000000, end: 1719219600000, expiresAt: Date.now() + 120000 });
```

### release

```ts
async release(id: string): Promise<void>
```

Release (delete) a hold by id before it expires.

```ts
await db.holds.release(hold.id);
```

### get

```ts
async get(resourceId: string, filter?: { start?: number; end?: number }): Promise<Hold[]>
```

List holds for a resource. When both `filter.start` and `filter.end` are given, return only holds overlapping the half-open window `[start, end)`.

```ts
const active = await db.holds.get(room.id, { start: 1719187200000, end: 1719273600000 });
```

### getMany

```ts
async getMany(resourceIds: string[]): Promise<Record<string, Hold[]>>
```

Fetch holds for many resources in one round-trip, grouped by resource id. Every requested id is present (an empty array if none).

```ts
const byRoom = await db.holds.getMany([roomA.id, roomB.id]);
```

---

## availability

Availability is derived, never stored. It is computed as open windows minus blocking rules minus active allocations (bookings plus live holds), each allocation extended by its `bufferAfter`. These reads return the gaps between segments.

### get

```ts
async get(opts: { resourceId: string; start: number; end: number; minDuration?: number; }): Promise<AvailabilitySlot[]>
```

Compute free slots for a single resource within `[start, end)`. `minDuration` filters to slots at least that long.

```ts
const slots = await db.availability.get({ resourceId: room.id, start: 1719187200000, end: 1719273600000, minDuration: 1800000 });
```

### getCombined

```ts
async getCombined(opts: { resourceIds: string[]; start: number; end: number; minAvailable?: number; minDuration?: number; }): Promise<AvailabilitySlot[]>
```

Compute merged availability across several resources within `[start, end)`. `minAvailable` controls how many must be free at once: it defaults to all (intersection), `1` is a pool (union), `k` is at least `k` free. Result slots carry no `resource_id` because the set is merged into one combined timeline.

```ts
const pool = await db.availability.getCombined({ resourceIds: [roomA.id, roomB.id], start: 1719187200000, end: 1719273600000, minAvailable: 1 });
```

### getMany

```ts
async getMany(opts: { resourceIds: string[]; start: number; end: number; minDuration?: number; }): Promise<Record<string, AvailabilitySlot[]>>
```

Compute per-resource availability for several resources in one round-trip, grouped by resource id (the analog of `bookings.getMany` / `holds.getMany`). Unlike `getCombined`, it does not merge the set: rows stay tagged with their `resource_id`.

```ts
const byRoom = await db.availability.getMany({ resourceIds: [roomA.id, roomB.id], start: 1719187200000, end: 1719273600000 });
```

---

## events

Real-time change notification. Changes are pushed the instant they happen over a per-resource channel (`resource_<id>`), and events bubble to ancestors up the parent tree.

### listen

```ts
async listen(resourceId: string, callback: (event: DeltaTEvent) => void): Promise<() => Promise<void>>
```

Subscribe to LISTEN/NOTIFY events for a resource (channel `resource_<id>`). Returns an async unsubscribe function. Malformed payloads are silently ignored.

```ts
const stop = await db.events.listen(room.id, (e) => console.log(e));
await stop();
```

---

## Recurring hours

There is no recurrence verb in the SDK. Recurrence, timezones, and calendars live at the edge: you expand a recurring pattern into concrete non-blocking rule segments in your own code, then hand the kernel plain `[start, end)` instants. Use `rules.replaceOpenHours` to swap a resource's open hours for a freshly expanded set (create-then-delete, so the schedule is never empty mid-run), or `rules.create` to add segments:

```ts
const segments = expandWeeklyHours(weekStart);
await db.rules.replaceOpenHours(room.id, segments);
```

---

## Notes

### `DeltaT.sql` is an escape hatch, not a verb

`db.sql` exposes the raw underlying postgres `Sql` instance. It is public and real, but it is an advanced escape hatch, not part of the verb surface, so it is deliberately not documented as an API verb. Using it ties your code to the transitional pgwire transport, which is the current core transport only and is slated for replacement by the framed `Command` protocol. Prefer the verbs above; reach for `db.sql` only when no verb covers what you need.

### Lifecycle direction (today vs the target)

Today's verbs are not yet the canonical lifecycle vocabulary the protocol targets. The target names a Hold lifecycle of place/commit/release and a Booking lifecycle of confirm/cancel; the current SDK uses `holds.place`/`holds.release` and `bookings.create`/`bookings.cancel` instead, and `bookings.create` stands in for confirm.

Most importantly: **no `commit` verb exists yet, at any layer.** Turning a hold into a booking today is `holds.release` followed by `bookings.create`, which is a non-atomic release-then-book. That leaves a real time-of-check-to-time-of-use (TOCTOU) window where another caller can slip into the freed slot before your booking lands. The atomic `CommitHold` (one lock, excluding that hold from the conflict check) is specified but unbuilt at HEAD. Until it ships, treat hold-to-confirm as best-effort, not as an atomic handoff.
