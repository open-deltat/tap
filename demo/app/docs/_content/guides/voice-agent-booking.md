A voice agent booking an appointment has a problem no web form has: it must say the slot out loud before it can take it.

The caller asks what is free. The agent reads back three options. The caller thinks, asks whether parking is included, then says "the three o'clock one". Twenty seconds have passed since the availability query, spoken into a phone line, and the agent is now about to write a booking based on something it said a third of a minute ago.

If a second caller was in the same twenty seconds, both hear "three o'clock is free" and both get confirmed. Neither agent did anything wrong. This page is about closing that.

## The gap is the sentence

In a web app, the stale-read window is the time between rendering a page and the user clicking. You can shrink it, and users tolerate a "that slot just went" error because they can see the screen change.

On a call there is no screen. The window is a spoken exchange, and it cannot be shrunk, because reading the options aloud is the product. Worse, the recovery is expensive: telling a caller at the end of a conversation that the slot they agreed to is gone means starting the booking over in a medium where every correction costs ten seconds and some goodwill.

So the fix cannot be a faster read. The slot has to stop being available at the moment the agent offers it.

## Hold when you offer, commit when they agree

Place the hold before the sentence leaves the agent's mouth, with a TTL sized to the call.

```ts
import { DeltaT } from "@open-deltat/client";

const db = new DeltaT({ database: "salon" });

const slots = await db.availability.get({
  resourceId: chair.id,
  start: dayStart,
  end: dayEnd,
  minDuration: 45 * 60 * 1000,
});

// Claim the three the agent is about to read out. Two minutes is a phone call,
// not a checkout flow.
const offered = await Promise.all(
  slots.slice(0, 3).map((slot) =>
    db.holds.place({
      resourceId: chair.id,
      start: slot.start,
      end: slot.start + 45 * 60 * 1000,
      expiresAt: Date.now() + 2 * 60 * 1000,
    })
  )
);

// "I have 10:15, 1:30, or 3:00." ... "Three o'clock, please."

const { bookingId } = await db.holds.commit(offered[2].id, { label: caller.name });

// Let the other two go straight back, do not wait for the timer.
await Promise.all(offered.filter((_, i) => i !== 2).map((h) => db.holds.release(h.id)));
```

Three things fall out of this that matter on a call.

A concurrent caller now hears a different set of times, because the held spans are already out of availability. There is no second confirmation to issue.

The commit is one atomic server-side statement: the hold becomes the booking in place, and the slot is never briefly open between the two. This is the part a release-then-insert flow gets wrong, and on a phone line the race it opens is not theoretical, since agents batch their tool calls at machine speed.

If the call drops, and calls drop, nobody has to detect it. The holds expire and the times come back. There is no cleanup job to write and no orphaned reservation to explain to the salon owner on Monday.

## Do not hold the whole day

The temptation is to hold every slot the agent might mention, or to hold with a generous TTL "just in case". Both quietly take the business offline. A held slot is invisible to the website, the walk-in, and the other agent, so an over-eager hold policy is an outage that looks like a full calendar.

Two rules keep it honest. Hold only what you are about to say, usually two or three options. Release the losers the moment the caller picks, instead of leaving them to time out.

The server enforces a ceiling regardless: `expiresAt` is clamped to the server clock plus `DELTAT_MAX_HOLD_TTL_MS` (one hour by default), so a bad client cannot park the calendar. Read the hold back with `holds.get` if you need the effective expiry.

## Latency, and why the agent should not wait

A voice agent cannot afford dead air, which is why platforms tell you to speak filler while a query runs. Two things keep the pause small here. Availability is a sweep over one timeline, so the query does not fan out across a booking table. And the holds go in concurrently, as in the code above; placing three in sequence triples the wait for no reason.

If the pause is still audible, place the hold on the first option while the agent begins speaking and the rest while it finishes. What must hold is the ordering per slot: claim it before you say it. Claiming all of them before saying any of them is not required.

## When the caller says a time you did not offer

Callers ignore menus. "Do you have anything Tuesday morning?" arrives after the agent has already held three afternoon slots.

Release what you are holding, query the new window, hold again. Holds are cheap and disposable, and the release is immediate. Treating them as a lease you renew across the whole conversation is the wrong model; they are per-utterance.

## Rejections are content, not errors

A `commit` on an expired or consumed hold is rejected. On a call this is a line of dialogue, not an exception:

```ts
try {
  await db.holds.commit(hold.id, { label: caller.name });
} catch {
  const next = await db.availability.get({ resourceId: chair.id, start, end });
  // "Ah, that one just went while we were talking. I can do 3:30?"
}
```

An agent that fails loudly and offers the next slot ends the call with a real appointment. An agent that swallows the error ends the call with a happy caller and an empty calendar, which is the expensive one, because nobody finds out until someone shows up.

## Next

[Scheduling for AI agents](/docs/guides/ai-agent-scheduling) is the same pattern without the phone line, including retries and multi-item bookings. [What a booking hold is](/docs/guides/booking-holds) covers holds, expiry, and renewal on their own. [Real-time scheduling](/docs/guides/real-time-scheduling) is how a dashboard watching the same calendar stays current while the agent works.
