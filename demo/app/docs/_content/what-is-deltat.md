Δt is a calendar for agents. People and agents book on the same calendar at the same moment, every screen sees the change at once, and nothing is ever booked twice.

Google Calendar, Apple Calendar and Outlook were built for a person looking at their own week. Every app that connects to them keeps a copy and checks back now and then. That is fine for a human. It breaks when several agents book at once, because nothing in a list of events can hold a slot, refuse a second booking, or tell everyone the moment something changed. Here is the same Tuesday afternoon on both:

<!--WITH_WITHOUT-->

## An agent can do four things

Everything an agent needs from a calendar comes down to four calls. Each has the colour its result has everywhere on this site: green is free, amber is held, ink is booked, and the live dot is a change arriving.

<!--VERBS-->

The order matters. An agent finds what is free, holds the slot it is about to offer, books it in one step when the person says yes, and listens so the next answer is never stale. [Find, hold, book, listen](/docs/holds-and-availability) walks through each one.

## Time, as one line

Underneath, Δt treats time as a single line. A booking is a stretch on it, with a start and an end. Two stretches either sit clear of each other or overlap, and an overlap is a double booking. Drag the second booking across the first:

<!--COLLISION-->

That one test is the whole conflict model, and the database runs it inside every write. A stretch includes its start and not its end, so a booking that ends at 10:00 and one that starts at 10:00 touch without colliding. Times are plain numbers, milliseconds since 1970, all the way through.

Free time is never stored. When you ask, Δt takes the open hours, subtracts the blocked time and everything booked or held, and hands back the gaps. A hold placed a moment ago is already gone from the answer; one that just expired is already back.

## Three ways in

- **For an agent:** the MCP server, `npx @open-deltat/mcp`. It gives any MCP client (Claude, Cursor, your own agent) the find, hold and book tools. Start with the [agent quickstart](/docs/quickstart).
- **For TypeScript:** `@open-deltat/client`, a typed SDK. Start with the [TypeScript quickstart](/docs/sdk/quickstart).
- **For anything else:** Δt speaks the PostgreSQL wire protocol, so any Postgres driver in any language connects. See [any Postgres client](/docs/guides/postgres-wire).

Δt itself is one open-source binary with no other database behind it. Run it yourself with [self-host](/docs/sdk/self-host), or have it run for you with a [founding pilot](/#pricing).
