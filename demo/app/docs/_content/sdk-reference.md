This is the full verb surface of the TAP TypeScript SDK, one entry per verb, grouped by namespace. Each entry has a signature, a line on what it does, and a tiny example. If a method is not on this page, it is not a verb.

The running example throughout is a ticketing setup: Acme Tickets owns a Stadium, the Stadium has Section A, and Section A has Seat 12. Resources nest like that, and only the leaves (the seats) carry a real timeline.

New to the model these verbs act on? Start with [What is Δt](/docs), then the [Data model](/docs/data-model) and [Holds and availability](/docs/holds-and-availability).

## Three things to know first

These hold for every verb, so they are stated once here.

- **Intervals are half-open `[start, end)`.** The start instant counts, the end instant does not. So `[10:00, 11:00)` and `[11:00, 12:00)` sit next to each other without colliding. Two spans collide only when they actually share a moment.
- **Time is Unix milliseconds.** Every `start`, `end`, and `expiresAt` is an integer count of milliseconds since the epoch. No `Date` objects, no strings. Timezones and calendars stay in your code.
- **Array verbs go in one round-trip.** `resources.createMany`, `rules.create`, and `bookings.create` send the whole array as a single statement, and the kernel applies it as one atomic batch: if any part conflicts, none of it is written. Heads up on naming: resources use `createMany` for the array form, but rules and bookings use `create` (there is no `bookings.createMany`).

## Setup

```ts
import { DeltaT } from "@open-deltat/client";

const db = new DeltaT({ host: "localhost", port: 5433, database: "acme", password: "deltat" });
```

## client

One `DeltaT` per database, and reuse it. The `database` value is the tenant, so different names get fully separate data.

### constructor

```ts
constructor(options?: DeltaTOptions | Sql)
```

Open a connection from options (`host`, `port`, `database`, `username`, `password`), or wrap an existing postgres `Sql` instance. Unspecified options fall back to sensible defaults (`localhost`, `5433`, database `default`, username `user`, password `deltat`).

```ts
const db = new DeltaT({ host: "localhost", port: 5433, database: "acme", password: "deltat" });
```

### close

```ts
async close(): Promise<void>
```

Close the underlying connection pool when you are done.

```ts
await db.close();
```

## resources

A resource is anything you can book. They form a tree: a resource can contain other resources, and only the leaves carry a timeline. Children inherit open hours from their ancestors (open hours override, nearest ancestor wins; blackouts accumulate down the tree). See the [Data model](/docs/data-model) for how that inheritance composes.

### create

```ts
async create(opts?: { parentId?: string | null; name?: string | null; capacity?: number; bufferAfter?: number | null; }): Promise<Resource>
```

Create one resource and get it back with a generated id. `capacity` defaults to 1; `parentId`, `name`, and `bufferAfter` default to null.

```ts
const stadium = await db.resources.create({ name: "Stadium" });
```

### createMany

```ts
async createMany(items: { parentId?: string | null; name?: string | null; capacity?: number; bufferAfter?: number | null; }[]): Promise<Resource[]>
```

Create several resources in one round-trip. They are applied in the order you pass them, so a later item can name a parent created earlier in the same call (build top-down).

```ts
const [acme, stadium] = await db.resources.createMany([{ name: "Acme Tickets" }, { name: "Stadium" }]);
```

### update

```ts
async update(id: string, opts: { name?: string | null; capacity?: number; bufferAfter?: number | null; }): Promise<void>
```

Change a resource's name, capacity, or bufferAfter. Only the fields you pass are written; passing nothing is a no-op.

```ts
await db.resources.update(sectionA.id, { capacity: 500 });
```

### delete

```ts
async delete(id: string): Promise<void>
```

Delete a resource by id.

```ts
await db.resources.delete(seat12.id);
```

### get

```ts
async get(filter?: { parentId: string } | { roots: true }): Promise<Resource[]>
```

List resources. No filter returns everything, `{ roots: true }` returns only top-level resources, and `{ parentId }` returns the direct children of one resource.

```ts
const sections = await db.resources.get({ parentId: stadium.id });
```

## rules

A rule paints a stretch of a resource's timeline open or closed. Leave `blocking` off (or false) for open hours, set it to true for a blackout. Availability is open hours minus blackouts minus active allocations.

### create

```ts
async create(items: { resourceId: string; start: number; end: number; blocking?: boolean; }[]): Promise<Rule[]>
```

Create one or many rules in one round-trip. Returns the created rules with generated ids.

```ts
await db.rules.create([{ resourceId: seat12.id, start: 1719216000000, end: 1719244800000 }]);
```

### replaceOpenHours

```ts
async replaceOpenHours(resourceId: string, segments: { start: number; end: number }[]): Promise<Rule[]>
```

Swap a resource's open hours for a new set. It creates the new rules first, then deletes the old ones, so a failure partway through never leaves the resource with no schedule at all. Blackouts and bookings are left alone. This is the "save my weekly hours" move.

```ts
await db.rules.replaceOpenHours(seat12.id, [{ start: 1719216000000, end: 1719244800000 }]);
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

List every rule on a resource.

```ts
const rules = await db.rules.get(seat12.id);
```

## bookings

A booking is a confirmed allocation: a half-open segment on a resource's timeline. It counts against availability and collides with any overlapping allocation.

### create

```ts
async create(items: { resourceId: string; start: number; end: number; label?: string; }[]): Promise<Booking[]>
```

Create one or many bookings in one round-trip, returned with generated ids. `label` is optional. An empty array returns an empty array.

```ts
const [b] = await db.bookings.create([{ resourceId: seat12.id, start: 1719216000000, end: 1719219600000, label: "Match night" }]);
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

List a resource's bookings. Pass both `start` and `end` to get only the ones overlapping that window.

```ts
const tonight = await db.bookings.get(seat12.id, { start: 1719187200000, end: 1719273600000 });
```

### getMany

```ts
async getMany(resourceIds: string[]): Promise<Record<string, Booking[]>>
```

Fetch bookings for many resources in one round-trip, grouped by resource id. Every id you asked for shows up in the result, with an empty array if it has none.

```ts
const bySeat = await db.bookings.getMany([seat11.id, seat12.id]);
```

## holds

A hold is a tentative allocation with a self-destruct timer. The moment it lands it blocks the slot for everyone, and if nobody confirms by `expiresAt` it quietly frees itself. That timer is what settles a race between two people grabbing the same seat. A hold only counts while `expiresAt > now`; an expired one is ignored on every read, and a background sweep eventually removes it.

### place

```ts
async place(opts: { resourceId: string; start: number; end: number; expiresAt: number; }): Promise<Hold>
```

Place one hold that auto-expires at `expiresAt` (Unix ms). Returns it with a generated id.

```ts
const hold = await db.holds.place({ resourceId: seat12.id, start: 1719216000000, end: 1719219600000, expiresAt: Date.now() + 120000 });
```

### release

```ts
async release(id: string): Promise<void>
```

Let go of a hold by id before it expires.

```ts
await db.holds.release(hold.id);
```

### get

```ts
async get(resourceId: string, filter?: { start?: number; end?: number }): Promise<Hold[]>
```

List a resource's holds. Pass both `start` and `end` to get only the ones overlapping that window.

```ts
const active = await db.holds.get(seat12.id, { start: 1719187200000, end: 1719273600000 });
```

### getMany

```ts
async getMany(resourceIds: string[]): Promise<Record<string, Hold[]>>
```

Fetch holds for many resources in one round-trip, grouped by resource id. Every requested id is present, empty array if none.

```ts
const bySeat = await db.holds.getMany([seat11.id, seat12.id]);
```

## availability

Availability is never stored, always computed on the spot: open hours, minus blackouts, minus active allocations (bookings plus live holds), with each allocation stretched by its `bufferAfter`. These reads give you the free gaps. The [Holds and availability](/docs/holds-and-availability) page walks through how it is computed.

### get

```ts
async get(opts: { resourceId: string; start: number; end: number; minDuration?: number; }): Promise<AvailabilitySlot[]>
```

Free slots for one resource inside `[start, end)`. `minDuration` drops gaps shorter than that. Slots carry only `start` and `end`.

```ts
const slots = await db.availability.get({ resourceId: seat12.id, start: 1719187200000, end: 1719273600000, minDuration: 1800000 });
```

### getCombined

```ts
async getCombined(opts: { resourceIds: string[]; start: number; end: number; minAvailable?: number; minDuration?: number; }): Promise<AvailabilitySlot[]>
```

Merge several resources into one timeline. `minAvailable` says how many must be free at once: it defaults to all of them (intersection), `1` treats them as a pool (any one free), and `k` means at least `k` free. The merged slots carry no resource id.

```ts
const anySeat = await db.availability.getCombined({ resourceIds: [seat11.id, seat12.id], start: 1719187200000, end: 1719273600000, minAvailable: 1 });
```

### getMany

```ts
async getMany(opts: { resourceIds: string[]; start: number; end: number; minDuration?: number; }): Promise<Record<string, AvailabilitySlot[]>>
```

Per-resource availability for several resources in one round-trip, grouped by id. Unlike `getCombined`, nothing is merged: each slot stays tagged with its resource.

```ts
const bySeat = await db.availability.getMany({ resourceIds: [seat11.id, seat12.id], start: 1719187200000, end: 1719273600000 });
```

## events

Real-time change notifications over a per-resource channel (`resource_<id>`). Events also bubble up to ancestors, so a subscriber on the Stadium hears about changes to Seat 12.

### listen

```ts
async listen(resourceId: string, callback: (event: DeltaTEvent) => void): Promise<() => Promise<void>>
```

Subscribe to changes on a resource. Returns an async unsubscribe function. Anything that arrives malformed is ignored.

```ts
const stop = await db.events.listen(seat12.id, (e) => console.log(e));
await stop();
```

## A few honest notes

**Recurrence lives in your code, not here.** There is no recurrence verb. Expand a recurring pattern into concrete `[start, end)` segments yourself, then hand them to `rules.replaceOpenHours` (to swap a whole schedule) or `rules.create` (to add some). The schedule and time-mask helpers that exist in the package are deliberately left off this verb surface.

```ts
const segments = expandWeeklyHours(weekStart);
await db.rules.replaceOpenHours(seat12.id, segments);
```

**`db.sql` is an escape hatch, not a verb.** It hands you the raw postgres connection. It is real and public, but reaching for it ties your code to the current transport. Use the verbs above; drop to `db.sql` only when nothing else covers the case.

**There is no commit verb yet.** Turning a hold into a booking today is two steps: `holds.release` then `bookings.create`. That gap is non-atomic, so another caller can slip into the freed slot before your booking lands. An atomic hold-to-booking handoff is planned but not built, so for now treat the two-step as best-effort.
