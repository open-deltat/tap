A single seat can hold one booking at a time. A yoga class can hold twenty. A parking zone can hold fifty cars that arrive and leave on their own schedules. Same timeline, different rule about how much can stack on it.

That rule is **capacity**: how many allocations may overlap on a resource at the same moment. This page covers how capacity changes the availability math, when to reach for it versus modeling seats as separate resources, and how to ask "is anything in this group free?" across a pool.

## Capacity is a count, not a loophole

Every resource has a capacity, and it defaults to 1: one allocation at a time, the behavior you want for a seat, a room, a dentist's chair. Set it higher and overlapping bookings become legal, up to the limit:

```ts
const yogaClass = await db.resources.create({
  name: "Tuesday Vinyasa",
  capacity: 20,
});
```

The conflict rule does not get softer, it gets counted. At every instant, Δt tallies how many allocations cover that moment. A moment is free while the count is below capacity, and full the moment it reaches it. The twenty-first booking on an overlapping span conflicts exactly the way a second booking on a single seat does, so overselling stays impossible without any application-side counting.

[Availability](/docs/holds-and-availability) follows the same count. A capacity-20 class with twelve bookings still shows the slot as free; with twenty it disappears. Holds count toward occupancy too, while they live, so twenty held spots read as full even before anyone pays.

## Capacity or child resources?

Two models can describe "a room with 20 spots", and the choice matters:

- **Capacity** when the units are interchangeable. Nobody books spot 14 in a yoga class; they book *a* spot. One resource, capacity 20, one timeline to manage. This also fits rental fleets, tour slots, and a walk-up bar.
- **Child resources** when the units have identity. Airline seats, theater seats, specific hotel rooms: people pick *which one*, prices differ, so each seat is its own resource under a parent ([the tree](/docs/data-model)), each with its own timeline and capacity 1.

The test is one question: does the customer care which unit they get? If yes, model units as resources. If no, model the count as capacity. Mixing them works too: the [restaurant demo](/demos/restaurant) models its floor as identified tables (resources) and its walk-up bar as one capacity-10 resource.

## Pools: is anything free?

Capacity handles many claims on one resource. The mirrored question spans many resources: three meeting rooms, and the caller wants any one of them. That is a combined availability query with a threshold:

```ts
const anyRoom = await db.availability.getCombined({
  resourceIds: [roomA.id, roomB.id, roomC.id],
  start,
  end,
  minAvailable: 1, // at least one of them free
});
```

`minAvailable` sets what "free" means for the group:

- **Default (all):** every listed resource free at once. This is the meeting-scheduler question: a time the whole group can make. The [group bookings demo](/demos/meet) runs on it.
- **`1` (a pool):** at least one free. Any room, any court, any van.
- **`k`:** at least k free. "We need two of the three trucks."

The combined answer comes back as one merged timeline of `{ start, end }` spans with no resource ids, because the question was about the group. When you need to know which member is free (to actually book it), follow up with `getMany`, which returns per-resource slots in one round-trip:

```ts
const byRoom = await db.availability.getMany({
  resourceIds: [roomA.id, roomB.id, roomC.id],
  start,
  end,
});
// Record<resourceId, AvailabilitySlot[]>
```

A pool query finds the window; a per-resource query picks the member; the booking write is still the [final arbiter](/docs/guides/prevent-double-booking) if two callers converge on the same room.

## A worked shape: the parking garage

The [parking demo](/demos/parking) shows the capacity half live. Each zone is a resource whose capacity is its spot count, so a car entering is a booking that overlaps everyone else in the zone, and the zone reads full exactly when the count says so. The garage's floors group the zones in the resource tree. "Any spot on floor 2" would be a pool query across that floor's zones; the demo itself reads each zone's own availability, and "zone B is full" is capacity doing the counting.

The same shape fits a gym's class schedule, a restaurant's bar, a rental fleet, a co-working floor. Capacity for the identical units, resources for the distinct ones, pool queries across whichever set the customer is indifferent about.

For where capacity sits in the data model, see [Data model](/docs/data-model). For the timing side of shared spaces (cleanup between bookings), see [Buffer time](/docs/guides/buffer-time).
