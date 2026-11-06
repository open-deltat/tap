This page gets an agent working on a real calendar in a few minutes, with no code. The quickest way is the hosted Δt at delt.at/mcp. You can also run your own.

## Use the hosted Δt

<!--CONNECT_AGENT-->

The first time your agent connects, it asks you to sign in. Every calendar it creates belongs to your account: you see it on your dashboard at delt.at, nobody else can see or change it, and other people reach it only through what you hand out, its booking link or a booking pass. Calendars are created this way only; the website shows them but does not make them.

| Tool | The agent uses it to |
| --- | --- |
| `create_calendar` | Make a calendar in your account: name, time zone, slot length, weekly hours, places at the same time, time between bookings |
| `list_my_calendars` | See your calendars, with their ids and booking links |
| `how_to_model_calendars` | Learn how to set up a business as calendars, from the examples on this site, before creating them |
| `find_meeting_times`, `request_meeting` | Ask for a meeting on someone's calendar; nothing is booked until its owner approves |
| `list_meeting_requests`, `approve_meeting_request` | Answer the requests on your own calendars |
| `create_booking_pass` | Let one person's agent book directly on your calendar, once, within a window |
| `find_times_with_pass`, `hold_with_pass`, `book_with_pass` | Book with a pass someone gave you |

## Or run your own Δt

The rest of this page sets up your own Δt and the open-source MCP server, which can do more (several calendars in one booking, cancelling, changing hours) on data you keep.

## 1. Run Δt

Δt is one open-source binary. The quickest way to run it is Docker:

```bash
docker run -p 5433:5433 -v deltat-data:/data \
  -e DELTAT_PASSWORD=<pick-a-password> \
  ghcr.io/open-deltat/deltat
```

That listens on port 5433 and keeps its data in the `deltat-data` volume. Pick a real password: without one, Δt makes up a random one at every start and prints it once. More options are on [self-host](/docs/sdk/self-host). If you would rather not run anything, a [founding pilot](/#pricing) gets you a hosted Δt.

## 2. Add the MCP server

The MCP server is `@open-deltat/mcp`. Your agent starts it with `npx`; it talks to the agent over stdio and to Δt over the network.

In Claude Code:

```bash
claude mcp add deltat \
  --env DELTAT_HOST=localhost \
  --env DELTAT_PASSWORD=<pick-a-password> \
  -- npx -y @open-deltat/mcp
```

In Claude Desktop, add this to `claude_desktop_config.json` and restart:

```json
{
  "mcpServers": {
    "deltat": {
      "command": "npx",
      "args": ["-y", "@open-deltat/mcp"],
      "env": {
        "DELTAT_HOST": "localhost",
        "DELTAT_PASSWORD": "<pick-a-password>"
      }
    }
  }
}
```

Any other MCP client takes the same command and environment. The settings:

| Variable | What it is | Default |
| --- | --- | --- |
| `DELTAT_PASSWORD` | The password you gave Δt | required |
| `DELTAT_HOST` | Where Δt runs | `localhost` |
| `DELTAT_PORT` | Its port | `5433` |
| `DELTAT_DATABASE` | Your tenant: each name is a separate, private set of calendars | `public` |
| `DELTAT_TLS` | `on` to connect over TLS | `off` |
| `DELTAT_TLS_CA` | A CA file to trust, for a private certificate | none |

## 3. Ask it to book

Now talk to your agent. Something like:

> Make a calendar called "Dr. Chen", open weekdays 9 to 5 Berlin time. Then book a 30 minute appointment for Ana on Tuesday afternoon.

The agent creates the calendar, finds what is free on Tuesday, holds a slot, and books it. Underneath, it is making the same three calls every time:

<!--AGENT_TOOLS-->

The hold is the point. When the agent is about to say "how about 14:30?", it holds 14:30 first, so the time it offers is the time it can book. The hold lasts five minutes and lets go on its own if nobody says yes. Then `commit_hold` turns it into a booking in one step, with no moment where the slot is free in between.

## Every tool on your own Δt

| Tool | The agent uses it to |
| --- | --- |
| `find_slots` | See what is free, on one calendar or on several at once (only times when all of them are free) |
| `hold_slot` | Keep a time for five minutes while it asks. On several calendars it holds all of them or none |
| `commit_hold` | Turn holds into bookings, all of them or none |
| `release_hold` | Let a held time go straight away |
| `create_calendar` | Make a new calendar, optionally with weekly opening hours |
| `set_availability` | Replace a calendar's weekly opening hours |
| `list_bookings` | See what is booked on a calendar, with booking ids |
| `cancel_booking` | Cancel a booking |
| `book_slot` | Nothing: it always refuses and points the agent at hold, then commit |

`book_slot` is there on purpose. Models expect a one-step "book" verb and will reach for one; this one answers with the two real steps instead of letting the agent invent a call.

## When the slot is gone

If another agent got there first, the refusal says so and carries times that still work:

```json
{
  "error": "CONFLICT",
  "booked": false,
  "alternatives": [
    { "start": "2026-11-10T15:00:00.000Z", "start_local": "Tue, 3:00 pm" },
    { "start": "2026-11-10T15:30:00.000Z", "start_local": "Tue, 3:30 pm" }
  ],
  "next": "These times were free a moment ago but are NOT reserved. Offer one, then call hold_slot on it before you tell anyone it is theirs."
}
```

So the agent can say "that one just went, I can do 3:00 or 3:30" in the same turn. Other refusals carry a short code to act on: `EXPIRED` (the hold ran out, hold again), `INVALID` and `NOT_FOUND`.

## Good to know

- **Times are written with their zone.** Every time goes in as `2026-11-10T14:30:00+01:00` or with a `Z`. A time without a zone is refused rather than guessed. Answers come back in UTC plus a `start_local` in the zone the agent asked for.
- **Opening hours run 60 days ahead.** `create_calendar` and `set_availability` write the next 60 days of hours. Call `set_availability` again to roll them forward.
- **The agent needs the calendar id.** On your own Δt there is no tool to list calendars yet, so give the agent the `calendar_id` it got back from `create_calendar`, or keep it in your system prompt. On the hosted Δt, `list_my_calendars` has them.
- **Several things at once.** Pass several `calendar_ids` to find, hold and commit a room, a person and the equipment together: all of them or none.

## Next

- [Scheduling for AI agents](/docs/guides/ai-agent-scheduling): the pattern behind these tools, and what to do on retries.
- [Voice agents that book](/docs/guides/voice-agent-booking): the same thing on a live phone call.
- [TypeScript quickstart](/docs/sdk/quickstart): build the same flow in code, with capacity, buffers and live updates.
