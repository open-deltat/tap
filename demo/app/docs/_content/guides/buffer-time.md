On paper, a booking that ends at 9:00 and one that starts at 9:00 fit together perfectly. In the real world there is a hotel room to clean between guests, a table to reset between parties, a drive between two client visits. The calendar says back-to-back works; the physical world disagrees.

Buffer time is how you write that disagreement into the schedule, and where you put it decides whether it holds up. This page covers the buffer mechanism in Δt, why it lives on the resource instead of in your application code, and what it does to availability.

## Where buffers usually go wrong

Most systems bolt turnaround time on at the edges, and each bolt-on leaks:

- **Pad the displayed slots.** Offer 9:00, 10:00, 11:00 for 45-minute appointments and the padding survives exactly until another code path (an admin tool, an API client, an import) writes a booking without going through the slot picker.
- **Book fake "cleanup" bookings.** Now every real booking drags a shadow booking that must be created, moved, and cancelled in sync with it. Miss one and the schedule lies in one direction or the other.
- **Check it in application code.** The check runs wherever someone remembered to call it, which is the same failure shape as every other [check-then-write race](/docs/guides/prevent-double-booking).

The common flaw is that the timeline itself does not know about the gap. Anything that talks to the timeline directly walks straight through it.

## `bufferAfter`: the tail on every allocation

In Δt the buffer is a property of the resource. Set `bufferAfter` (in milliseconds, like every duration here) and every allocation on that resource occupies its own span plus that much tail:

```ts
const table = await db.resources.create({
  name: "Table 4",
  bufferAfter: 30 * 60_000, // 30 minutes of reset time after every booking
});
```

Book Table 4 from 7:00 to 9:00 and the timeline treats 7:00 to 9:30 as taken. The rules are small and worth knowing exactly:

- **The buffer extends the end, never the start.** A booking still begins exactly when it begins; the protected time is the turnaround after it.
- **It is not a separate booking.** Nothing extra to create, move, or cancel. The allocation just occupies more of the line.
- **It applies to every allocation on the resource,** bookings and [holds](/docs/guides/booking-holds) alike, from every client, through every code path. There is no unpadded way in.

## Availability already knows

Because the buffer is part of how an allocation sits on the timeline, [availability](/docs/holds-and-availability) accounts for it without being asked. With the 7:00 to 9:00 booking in place:

```ts
const slots = await db.availability.get({
  resourceId: table.id,
  start: sevenPm,
  end: midnight,
});
// the first free slot starts at 9:30, not 9:00
```

And since conflict checking and availability run on the same stretched spans, a booking attempt at 9:15 does not merely disappear from a list somewhere: it is rejected as an overlap. The half-open `[start, end)` convention still applies; the buffer moves where an allocation's effective end lands, and touching that new end remains legal. Back-to-back stays the default; the buffer is how a resource opts out of it deliberately.

## The buffer belongs to the resource

Putting the value on the resource, not the system, means turnaround varies where reality varies. A quick-service table might carry 10 minutes, the private dining room 45. An economy rental car needs a vacuum; a wedding limo needs a detail.

```ts
await db.resources.update(privateRoom.id, { bufferAfter: 45 * 60_000 });
```

Changing it is one update, and every future conflict check and availability answer uses the new tail. Buffers also compose with [capacity](/docs/guides/capacity): on a capacity-N resource each allocation carries its own tail into the occupancy count.

## See it live

The [restaurant demo](/demos/restaurant) seeds its tables with exactly the 30-minute buffer above: book a table and watch the following half hour go dark for the next party. For where `bufferAfter` sits among the other resource knobs, see the [Data model](/docs/data-model).
