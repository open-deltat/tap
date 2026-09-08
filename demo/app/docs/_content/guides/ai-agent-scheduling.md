An AI agent that books appointments runs the same three steps every scheduling system has always run:

```
1. read:  what is free on Thursday?
2. think: talk to the user, decide, get a confirmation
3. write: book it
```

The steps are not new. What changed is step 2. In a form-driven app it is a human clicking a button. In an agent it is a model round trip, a tool-call loop, sometimes a spoken back-and-forth, and often a retry. Seconds, not milliseconds. The window where the read is stale grew by three orders of magnitude, and it grew for every request at once, because agents run in parallel and never get tired.

So the classic double booking stops being an edge case at the on-sale minute and becomes the ordinary behaviour of the system. This page covers what an agent actually needs from a scheduling backend, and how to build it on Δt.

## Why availability alone is not enough

Most scheduling APIs hand an agent one primitive: list free slots. The agent reads them, says "Thursday at 3 works", and calls create. Between the read and the create, nothing was reserved. The list was a photograph, and the agent is quoting it back after the scene has changed.

Giving the agent a faster list does not fix this. Neither does re-reading right before the write, which just shrinks the window to something you cannot test. The read is not the problem. The problem is that nothing happened when the agent decided.

## The shape that works: propose, then confirm

An agent needs two separate moments, and a backend that can tell them apart.

**Propose.** The instant the agent picks a candidate slot, claim it with a timer. Not a booking, and not a note in the agent's memory: a real claim in the database that removes the slot from everyone else's availability and expires by itself if nothing else happens.

**Confirm.** When the user says yes, turn that exact claim into a booking, atomically, without ever letting go of it.

In Δt that is a hold and a commit.

```ts
import { DeltaT } from "@open-deltat/client";

const db = new DeltaT({ database: "clinic" });

// 1. read
const slots = await db.availability.get({
  resourceId: room.id,
  start: Date.now(),
  end: Date.now() + 7 * 24 * 60 * 60 * 1000,
  minDuration: 30 * 60 * 1000,
});

// 2. propose: claim it before the model says a word about it
const hold = await db.holds.place({
  resourceId: room.id,
  start: slots[0].start,
  end: slots[0].start + 30 * 60 * 1000,
  expiresAt: Date.now() + 5 * 60 * 1000,
});

// ...the agent talks to the user, the user agrees...

// 3. confirm: one atomic statement, no gap
const { bookingId } = await db.holds.commit(hold.id, { label: "Dana R." });
```

The commit is a single server-side statement under one lock. The hold becomes the booking in place. There is no moment where the slot is released and re-taken, so no competing writer can slip in between, which is exactly the failure the naive two-step version has.

If the user walks away, or the call drops, or the model wanders off mid-conversation, nobody has to clean up. The hold expires and the slot returns on its own. Abandonment is the default path, and it is free.

## The agent will retry. Plan for it.

Tool calls time out and get re-issued. Models call the same tool twice because the first response was slow. An orchestrator restarts a step. Any of these can produce two identical booking attempts a second apart.

Two things make this survivable.

A hold is a named object with an id. A retry that already has a hold id calls `commit` again, and a second commit on a consumed hold is rejected rather than producing a second booking. The agent's own state carries the idempotency key, and you did not have to invent one.

A conflict is an ordinary, expected answer. When `place` or `commit` is rejected, the slot is gone; that is information, not an exception to swallow. The right agent behaviour is to say so and offer the next opening, which is a better conversation than confirming an appointment that does not exist.

```ts
try {
  await db.holds.commit(hold.id, { label: name });
} catch {
  // The hold expired or the slot went. Re-read and offer again.
  const next = await db.availability.get({ resourceId: room.id, start, end });
  // "That one just went. I can do 3:30 instead."
}
```

## Set the timer to the length of the conversation

`expiresAt` is a request, not a command. The server clamps it to its own clock plus a maximum TTL (`DELTAT_MAX_HOLD_TTL_MS`, one hour by default), so a client with a wrong clock or an optimistic idea of how long a chat runs cannot park a slot forever. Read the hold back with `holds.get` if you need the effective expiry for a countdown.

Pick the TTL from the interaction, not from a config default. A voice call that ends in ninety seconds does not need a fifteen-minute hold, and a slot held fifteen minutes is a slot nobody else could book. Short holds keep the timeline honest; the agent can always place another.

## Booking several things at once

Agents routinely commit to more than one span in a single sentence: a consultation plus the follow-up, a room plus the equipment, an appointment plus the travel either side. Booking those one call at a time reopens the race in its worst form, where the agent wins the first and loses the second and has already told the user it is done.

`bookings.create` takes an array and applies it as one atomic batch. Every span is checked against the timeline and against the others in the same request. One conflict anywhere rejects the whole thing and writes nothing.

```ts
await db.bookings.create([
  { resourceId: room.id, start, end, label: "consult" },
  { resourceId: room.id, start: end, end: end + HOUR, label: "follow-up" },
]);
// both, or neither
```

Multi-hold atomic commit, where several separate holds convert together or not at all, is on the roadmap and not shipped. Today, batch the bookings when you can and hold the single scarce resource when you cannot.

## What Δt does not do for you

Δt is a database for time. It does not know what a customer is, does not send the confirmation email, and does not decide which slot the agent should offer. It answers what is free, holds a claim, and refuses a write that would double-book. Identity, payment, and the conversation stay in your application, where an agent framework already has them.

There is no hosted Δt MCP server yet. Δt speaks the PostgreSQL wire protocol, so an agent reaches it through the TypeScript SDK or any Postgres client in any language your tooling already supports; wiring that into a tool definition is a few lines.

## Next

[What a booking hold is](/docs/guides/booking-holds) covers holds on their own, including expiry and renewal. [Preventing double bookings](/docs/guides/prevent-double-booking) is the same race without an agent in it. [Voice agents that book](/docs/guides/voice-agent-booking) is this pattern under the timing pressure of a live phone call. To watch two clients fight over one slot, open the [realtime seats demo](/demos/live) in two windows.
