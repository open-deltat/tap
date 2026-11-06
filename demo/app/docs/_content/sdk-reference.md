This is the full verb surface of the TAP TypeScript SDK, one entry per verb, grouped by namespace. Each entry has a signature, a line on what it does, and a tiny example. If a method is not on this page, it is not a verb.

The running example throughout is a ticketing setup: Acme Tickets owns a Stadium, the Stadium has Section A, and Section A has Seat 12. Resources nest like that, and only the leaves (the seats) carry a real timeline.

New to the model these verbs act on? Start with [What is Δt](/docs), then the [data model](/docs/data-model) and [find, hold, book, listen](/docs/holds-and-availability). For an agent, the [agent quickstart](/docs/quickstart) needs no code.

## Three things to know first

These hold for every verb, so they are stated once here.

- **Intervals are half-open `[start, end)`.** The start instant counts, the end instant does not. So `[10:00, 11:00)` and `[11:00, 12:00)` sit next to each other without colliding. Two spans collide only when they actually share a moment.
- **Time is Unix milliseconds.** Every `start`, `end`, and `expiresAt` is an integer count of milliseconds since the epoch. No `Date` objects, no strings. Timezones and calendars stay in your code.
- **Array verbs go in one round-trip.** `resources.createMany`, `rules.create`, and `bookings.create` send the whole array as a single statement, and the kernel applies it as one atomic batch: if any part conflicts, none of it is written. Heads up on naming: resources use `createMany` for the array form, but rules and bookings use `create` (there is no `bookings.createMany`).

## Setup

```ts
import { DeltaT } from "@open-deltat/client";

const db = new DeltaT({ host: "localhost", port: 5433, database: "acme", password: process.env.DELTAT_PASSWORD });
```

## client

One `DeltaT` per database, and reuse it. The `database` value is the tenant, so different names get fully separate data.

### constructor

```ts
constructor(options?: DeltaTOptions | Sql)
```

Open a connection from options (`host`, `port`, `database`, `username`, `password`, `tls`), or wrap an existing postgres `Sql` instance. Unspecified options fall back to `localhost`, `5433`, database `default` and username `user` (the server ignores the username). Always pass the password the server was started with: the client's own fallback, `deltat`, only works if you started the server with that password. `tls: true` (or `{ ca }` for a private certificate) connects over TLS, always verified.

```ts
const db = new DeltaT({ host: "localhost", port: 5433, database: "acme", password: process.env.DELTAT_PASSWORD });
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

### find

```ts
async find(id: string): Promise<Resource | undefined>
```

Look up one resource by id.

```ts
const seat = await db.resources.find(seat12.id);
```

A resource that still has children cannot be deleted; delete the children first.

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

`expiresAt` is a request, not an assignment: the server clamps it to its own clock plus a maximum TTL (`DELTAT_MAX_HOLD_TTL_MS`, one hour by default), and the returned `Hold` echoes what you asked for. For countdowns and renewal logic, read the hold back with `get` and trust the server's `expiresAt`.

```ts
const hold = await db.holds.place({ resourceId: seat12.id, start: 1719216000000, end: 1719219600000, expiresAt: Date.now() + 120000 });
```

### commit

```ts
async commit(holdId: string, opts?: { label?: string }): Promise<{ bookingId: string }>
```

Convert a live hold into a booking in one atomic server-side statement. The booking takes over the hold's resource and span and the hold is consumed, so no competing writer can take the span in between. Rejects if the hold is unknown, already released, or expired; place a new hold and retry.

```ts
const { bookingId } = await db.holds.commit(hold.id, { label: "order-4417" });
```

### placeMany

```ts
async placeMany(items: { resourceId: string; start: number; end: number; expiresAt: number; }[]): Promise<Hold[]>
```

Place several holds as one: every hold lands, or none does, even across different resources. Use it to hold a room, a person and the equipment together while you ask. Needs Δt 0.4.0 or later for more than one hold.

```ts
const holds = await db.holds.placeMany([
  { resourceId: room.id, start, end, expiresAt },
  { resourceId: doctor.id, start, end, expiresAt },
]);
```

### commitMany

```ts
async commitMany(holdIds: string[], opts?: { label?: string }): Promise<{ bookingIds: string[] }>
```

Turn several holds into bookings in one step: all of them, or none if any hold has expired or is gone.

```ts
const { bookingIds } = await db.holds.commitMany(holds.map((h) => h.id), { label: "consult" });
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

Availability is never stored, always computed on the spot: open hours, minus blackouts, minus active allocations (bookings plus live holds), with each allocation stretched by its `bufferAfter`. These reads give you the free gaps. The [find, hold, book, listen](/docs/holds-and-availability) page walks through how it is computed.

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

### watch

```ts
async watch(resourceId: string, onChange: (change: Change) => void, options?: WatchOptions): Promise<() => Promise<void>>
```

The one to reach for first. You get a plain change (`held`, `booked`, `hold_ended` or `cancelled`) for the resource and everything under it. It reconnects on its own, and if it falls behind it re-reads the calendar so you are never left with a wrong picture. `options` takes an optional `window` and callbacks such as `onReady` and `onLagged`.

```ts
const stop = await db.events.watch(section.id, (change) => render(change));
await stop();
```

### listen

```ts
async listen(resourceId: string, callback: (event: DeltaTEvent) => void, handlers?: { onError?; onDisconnected?; onResubscribed?; onGone?; onRetryFailing? }): Promise<() => Promise<void>>
```

The raw stream underneath `watch`: every event exactly as the server sends it. It reconnects on its own. Returns an async unsubscribe function; anything that arrives malformed is ignored.

```ts
const stop = await db.events.listen(seat12.id, (e) => console.log(e));
await stop();
```

## errors

The client throws the driver's own errors. Three helpers read them, and none of them throws.

- **`classifyRefusal(err)`** gives `{ code, message, offer }`, where `code` is `CONFLICT` (the time is taken, or outside open hours), `EXPIRED` (the hold ran out), `NOT_FOUND`, `INVALID` or `INTERNAL`.
- **`counterOffer(err)`** gives the times that still work, when the refusal carried them.
- **`sqlstateOf(err)`** gives the raw Postgres error code, for anything else.

```ts
import { classifyRefusal } from "@open-deltat/client";

try {
  await db.holds.commit(hold.id);
} catch (err) {
  const { code, offer } = classifyRefusal(err);
  if (code === "CONFLICT" && offer) offerTimes(offer.alternatives);
}
```

## helpers

**Recurrence lives in your code, not in the database.** There is no recurring rule inside Δt. `expandRecurrence` turns a weekly pattern (with an IANA `timeZone` and optional excluded dates) into concrete `[start, end)` segments, which you then hand to `rules.replaceOpenHours` or `rules.create`. [Recurring hours](/docs/guides/recurring-availability) walks through it.

**`db.sql` is an escape hatch, not a verb.** It hands you the raw postgres connection. It is real and public, but reaching for it ties your code to the current transport. Use the verbs above; drop to `db.sql` only when nothing else covers the case.

**Convert holds with `holds.commit` or `holds.commitMany`, never with release-then-create.** The two-step version leaves an instant where the slot is free and a competing caller can take the very span the hold was protecting.
