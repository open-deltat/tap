> The diagram above uses a Flight / Hotel / Dinner travel scenario to show the idea. Every other page in these docs uses one running example instead: Acme Tickets > Stadium > Section A > Seat 12. The travel metaphor lives here and nowhere else.

## The locked dimensions

Space has three dimensions. Time is the fourth, and it is representable as a single line: the number line of instants (Unix time). Scheduling is 1-D collision detection. A booking is a half-open segment `[start, end)` placed on that line, and a conflict is two segments overlapping on that one line. There is no second spatial axis to index.

Every scheduling concept is that one primitive wearing different clothes:

- A booking is a segment on the line.
- A conflict is two segments overlapping.
- Capacity is how many segments may stack on a point.
- A buffer is a forced gap after a segment.
- A rule is an open or closed region of the line.
- A hold is a segment with a self-destruct timer.
- Availability is the gaps between segments.

Δt is not a literal 2-D index. It is N coupled 1-D timelines, keyed by an opaque resource id and bound together by batch atomicity. The resource id is a categorical lock key, not a metric second dimension. The load-bearing property is the atomicity that binds the timelines, not a second axis.

Two taglines hold the frame:

> Δt: a database for time.

> tap: time thought as 1-D collisions.

## Where to go next

The docs split along the same line as the product. Δt is the database. tap is how you use it.

### Δt is the database

Data model, holds, availability, protocol. The kernel that owns the one timeline: resources as a parent/child tree, time stored as labelled stretches where free is open minus blocked minus booked, holds that auto-expire, and availability derived (never stored) with sub-millisecond reads. Start with [Data model](/docs/data-model).

### tap is how you use it

SDK, quickstart, self-host. The edge that talks to the kernel: the TypeScript client with namespaces for `resources`, `rules`, `bookings`, `holds`, `availability`, and `events`, plus everything human (timezones, calendars, recurrence, display) that lives outside the kernel. Start with the [Quickstart](/docs/sdk/quickstart).
