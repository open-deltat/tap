"Real-time" in scheduling means one thing: what a screen shows and what the database believes have not drifted apart. A seat map that says a seat is free when it went two seconds ago is not slow, it is wrong, and the person who clicks it finds out at the worst moment.

The usual answer is polling, which turns a correctness problem into a cost problem and never quite solves either. This page covers what Δt gives you instead, and where the honest limits are.

## Why polling stops working

Poll every thirty seconds and your screen is up to thirty seconds wrong. Poll every second and you have multiplied read load by thirty for the same answer, almost always unchanged. Neither dial makes the display correct at the moment of the click, because there is no interval short enough to cover the gap between render and action.

Machine clients make this sharper. An agent that fast-polls availability while a human sits on a checkout page generates constant load for information it will re-check anyway, and reads in Δt serialise behind commits, so aggressive polling by one client degrades write latency for every other. Faster polling is the wrong dial.

## Subscribe to the resource, then re-read

Δt exposes a change stream per resource over the PostgreSQL `LISTEN`/`NOTIFY` mechanism. The SDK wraps it:

```ts
import { DeltaT } from "@open-deltat/client";

const db = new DeltaT({ database: "theatre" });

const unsubscribe = await db.events.listen(screen.id, async () => {
  const slots = await db.availability.get({
    resourceId: screen.id,
    start: windowStart,
    end: windowEnd,
  });
  render(slots);
});

// later
await unsubscribe();
```

Note the shape. The callback ignores what the event says and re-reads availability. That is deliberate, and it is the part most implementations get wrong.

**Treat the event as a tick, never as the truth.** Δt fans notifications out to every subscriber and up the resource tree, and delivery under a large batch is best effort: measured at roughly two thirds of events reaching a single subscriber and about a quarter at a hundred subscribers when one legal 1,000-row batch lands at once. A screen that applies event payloads as a diff will silently drift out of sync. A screen that re-reads on any tick converges no matter how many ticks it missed, because the read is derived from the timeline rather than accumulated from a stream.

This costs you one round trip per change and buys you a display that cannot be permanently wrong. It also collapses naturally: a hundred events in a second produce one re-read if you debounce, which polling could never do.

## Availability is computed, not stored

The reason re-reading is cheap enough to do on every tick is that Δt does not keep an availability table to invalidate.

A resource is one timeline. Bookings, holds, and blocking rules are stretches on it. Availability is the gaps, computed by a sweep over that line at the moment you ask. There is no cache to expire, no materialised view to rebuild, and no window where the derived answer disagrees with the events that produced it. A hold placed a millisecond ago is already absent from the next availability read, with nothing in between to invalidate.

This is also why a stale read cannot become a bad booking. The display is a hint; the write is the decision, and the conflict check runs inside the write against the same timeline. Two clients racing for the last seat both see it, both attempt it, and exactly one lands. See [preventing double bookings](/docs/guides/prevent-double-booking) for what happens to the other.

## What real-time is for, and what it is not for

Use the stream for the things a human or an agent is looking at right now: a seat map with several people on it, a dispatcher board, a waiting room filling up, a booking page where holds appear and expire while someone reads it.

Do not use it as a job queue or a durable event log for a downstream system. There are no event ids, no redelivery, and no replay from a cursor, so a consumer that disconnects has no way to ask what it missed. A resumable cursor feed for machine clients is on the roadmap and not shipped. Until it is, anything that must not miss a change should own its own record of what it has processed and reconcile by re-reading, exactly as the callback above does.

## Holds are the real-time part users feel

The visible half of real-time scheduling is not the update, it is the countdown. When someone opens a booking page and the slot they are looking at is already claimed for them for the next five minutes, and the other tab watching the same page sees it disappear, the system feels live because it is behaving live.

Holds are what make that true rather than cosmetic, and the expiry is enforced server-side by a reaper rather than by whichever client happens to still be open. [What a booking hold is](/docs/guides/booking-holds) covers them properly.

## See it

The [realtime seats demo](/demos/live) is this page as a running page. Open it in two windows side by side and take the same seat in both: one hold lands, the other is refused, and both screens agree within a tick. For agents driving the same calendar, see [scheduling for AI agents](/docs/guides/ai-agent-scheduling).
