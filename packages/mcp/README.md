# @open-deltat/mcp

Give an agent a calendar it can actually book on, without ever double-booking.

```bash
npx @open-deltat/mcp
```

Most scheduling APIs give an agent one verb: *book*. That is fine for a form submission and wrong for
an agent, because an agent takes seconds to decide. It reads that 14:30 is free, says "how about
14:30?", waits for a human to answer, and by then someone else has taken it. Checking and booking are
two separate moments, and everything in between is a race.

This server has no one-step booking verb. Booking is:

```
find_slots  →  hold_slot  →  commit_hold
```

The hold is the point. It reserves the slot for a few minutes, so between offering a time and
confirming it, that time is yours and nobody else can take it. Holds expire on their own, so an
abandoned conversation cleans itself up and holding costs nothing.

Underneath is [deltat](https://delt.at), a database whose one invariant is that two bookings can
never occupy the same span. The refusal comes from the storage engine, not from application code that
checked first and hoped.

## Tools

| Tool | Use it when |
|---|---|
| `find_slots` | Before offering anyone a time. Lists what is genuinely free. |
| `hold_slot` | The moment you are about to name a specific time to a human. Returns a `hold_id`. |
| `commit_hold` | The booking is confirmed. Turns the hold into a booking, atomically. |
| `release_hold` | You know the held time is not wanted. Frees it immediately. |
| `create_calendar` | A new bookable calendar is needed. Returns the `calendar_id`. |
| `set_availability` | Opening hours change, or `find_slots` returns nothing. Replaces the whole week. |
| `list_bookings` | Someone asks what is scheduled, or you need a `booking_id` to cancel. |
| `cancel_booking` | A human asked for a confirmed booking to be cancelled. |
| `book_slot` | Never. It exists only to refuse and point you at `hold_slot` + `commit_hold`. |

That last row is deliberate. Every other calendar API has a one-step booking verb, so models reach
for one here and find nothing. Rather than let that become a hallucinated tool call or an
abandoned conversation, the verb is registered and refuses, explaining the two real steps in the
response. It never books anything.

Times cross the boundary as RFC 3339 strings with a mandatory offset, never bare epoch milliseconds.
A zoneless timestamp is rejected rather than silently interpreted in whatever zone the process runs
in. Errors come back with a typed prefix to branch on: `CONFLICT` (pick another slot), `EXPIRED`
(re-hold), `INVALID`, `NOT_FOUND`.

## Configure it

You need a deltat server. Self-host it with Docker:

```bash
docker run -p 5433:5433 -e DELTAT_PASSWORD=<your-password> ghcr.io/open-deltat/deltat
```

Then add the MCP server. In Claude Code:

```bash
claude mcp add deltat \
  --env DELTAT_HOST=localhost \
  --env DELTAT_PORT=5433 \
  --env DELTAT_DATABASE=public \
  --env DELTAT_PASSWORD=<your-password> \
  -- npx -y @open-deltat/mcp
```

In Claude Desktop, edit `claude_desktop_config.json` and restart:

```json
{
  "mcpServers": {
    "deltat": {
      "command": "npx",
      "args": ["-y", "@open-deltat/mcp"],
      "env": {
        "DELTAT_HOST": "localhost",
        "DELTAT_PORT": "5433",
        "DELTAT_DATABASE": "public",
        "DELTAT_PASSWORD": "<your-password>"
      }
    }
  }
}
```

`DELTAT_PASSWORD` is required and has no default; the server refuses to start without it rather than
trying a guessable one. Everything else defaults to a local deltat on `localhost:5433`, database
`public`. Each database name is an isolated tenant.

Then just ask: *"Create a calendar called Haircuts open weekday afternoons, then book me the first
free 30-minute slot tomorrow."*

## Authentication, honestly

**This stdio server has no login.** The deltat password in your config is the credential, and the
server runs with your user's permissions. That is the single-operator self-host model: you own the
deltat, you own the agent, and it needs no OAuth.

**A hosted multi-tenant server is a different problem.** There an agent authenticates with OAuth 2.1:
the server answers an unauthenticated call with `401` plus protected-resource metadata (RFC 9728),
and a capable client runs authorization-code + PKCE itself, registering via a Client ID Metadata
Document with one-time human consent. The `OidcAdapter` in this package is the resource-server half
of that, verifying a bearer JWT offline against the issuer's JWKS with no per-request network call.

That hosted transport is not in this package yet. The stdio server above is what runs today.

## Embed it

```ts
import { createDeltatMcpServer } from "@open-deltat/mcp";
import { DeltaT } from "@open-deltat/client";

const server = createDeltatMcpServer(new DeltaT({ /* ... */ }));
await server.connect(yourTransport);
```

## Prove it end to end

With a deltat running:

```bash
bun scripts/smoke.ts
```

drives the whole loop through an in-memory MCP client and asserts the round trip
(create → availability → find → hold → commit → list → cancel).

## License

MIT
