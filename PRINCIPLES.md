# Product principles

Two ideas govern everything this product shows to a person, a developer, or a model.

## 1. Build the primitive once; scope the product, not the engine

deltat's kernel takes arbitrary resources. A resource has a capacity, an optional parent, a buffer,
and a place in a tree. A restaurant with fifty tables, a hotel with room types, a flight with seats,
and one person's appointment calendar are the same primitive at different shapes. The client, the
SDK, and the MCP server expose that primitive directly, so anyone running their own deltat can model
any of them today.

The hosted platform chooses to show one shape: a single calendar with open hours. That is a *product*
decision at the UI layer, not a limit in the engine. Someone who self-deploys this repository is not
restricted, and the managed builder for richer spaces ([`deltat` VIS-11](https://github.com/open-deltat/deltat))
is deferred, not foreclosed. Build the capability once and it works everywhere: self-host, managed,
SDK, API, MCP. The UI decides what to reveal; it never removes what the kernel can do.

Corollary: never bake "one resource per calendar" so deep that multi-resource needs a rewrite. The
ownership/registry layer names the things people book; it should extend to a group of resources
without changing the kernel or the wire.

## 2. Everything a stranger sees must be beautiful and obvious

This is a product people hand to each other. A booking link goes from a business to its customers. A
calendar is shared peer to peer. An API and an MCP server are handed to another developer, or to
another company's AI agent. Each of those is a first impression made without us in the room, so every
externally-facing surface is a growth surface, and an ugly or confusing one is a growth bug. The
technology is good enough that the moment someone uses it they understand it; beauty is what gets them
to that moment. Treat it as load-bearing, not decoration.

"Externally-facing" is wider than the UI:

- **The booking page and dashboard.** Beautiful, theme-aware, legible in seconds. A stranger should
  understand what this is and how to use it without being told.
- **The docs and developer experience.** A copy-paste quickstart that actually runs, honest examples,
  no dead ends.
- **The API and the SDK.** Names that read like the domain; errors that say what to do next.
- **The MCP tools and `llms.txt`.** Tool descriptions, argument names, and typed errors are read by a
  model on every call and surfaced in its reasoning to the user. They are UX. `CONFLICT: pick another
  slot` is good design; a raw stack trace is not. An agent-facing surface gets the same care as a
  human-facing one, because increasingly the agent is the user.

## 3. Hold the minimum, for the shortest time

A hold takes time out of circulation. It is the one thing this system gives away, so it is also the
only thing worth being stingy about. Every design decision should push toward holding *less* for
*less long*.

- **Hold what was asked for, never a superset.** An agent told "Tuesday, Wednesday or Thursday
  afternoon" holds those candidate slots, not the week. If the caller has not narrowed it down, the
  right move is to ask one more question, not to reserve everything that might qualify. A vague
  request is a prompt for a better query, not a licence to hold inventory.
- **The TTL is sized to the conversation, not to the convenience.** A hold exists to survive a human
  round trip: "let me check with my wife." That is minutes. Anything longer is squatting.
- **An escrow hold is network-short.** When a hold spans several resources or several parties, it
  only has to live as long as the calls it is coordinating: a second or two, not the default TTL.
  Chain or delegate the holds and commit as fast as the network allows. A short escrow is a
  respectful one, because every second of it is time nobody else can book.
- **Bound holds per identity.** Hold squatting is the cheapest attack on a booking rail, and the
  cap is only enforceable once writes are attributable, which is why identity on writes is a
  performance feature and not only a safety one.

The engineering consequence: prefer a precise query over a broad reservation, always. The product
consequence: because holds are cheap and short, they can be free, and a rail where speculative holds
are free is one no per-booking pricing model can follow.

## 4. Never return a dead end

Real time is not only about speed, it is about recovery. Every failure this system produces should
carry the thing the caller needs to get unstuck, in the same response, so a lost race costs one
round trip rather than three and a model turn rather than several.

- **A refusal without an alternative is a bug.** Losing a hold should return the next workable slots,
  not an apology. Contention is the steady state of a booking system, not an exception.
- **Never act on the caller's behalf to avoid an error.** Offering alternatives is help; silently
  booking one of them is a betrayal. The caller, human or agent, always makes the choice.
- **Count the round trips and the model calls.** On a live phone call each one is audible dead air.
  The cheapest error handling is the kind that never needs a second question.

## 5. Co-location is the common case; federation is the honest exception

People book with people near them. Personal schedules cluster naturally: one tenant, one node, and
even at large scale probably one node per country rather than one per person. That is not an
accident to route around, it is the shape of the demand, and it should be designed for.

- **Optimise for same-node atomicity.** Where all the timelines involved are on one node, a
  multi-party booking is genuinely all-or-nothing, with no coordinator and no consensus, because one
  lock manager and one log already order everything.
- **Degrade honestly across nodes.** Cross-home booking is a saga with compensation, not atomicity,
  and the return value must say which one actually ran. Never let an agent believe it got a
  guarantee it did not get.
- **The hold is already the escrow primitive.** A cross-home booking is try (hold each), confirm
  (commit each), abort (do nothing and let the TTLs expire). Decay-as-abort is what lets this work
  without a transaction coordinator, and it is the reason federation is a later feature rather than
  a different architecture.
