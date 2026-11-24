# Site tools: accuracy and legal notes (24.11.2026)

The pages on the `/tools` hub, how each stays correct, and what each may say. How a page is built
is in `demo/docs/TOOLS-PAGES.md`.

## Accuracy

| Page | Method | Upkeep |
|---|---|---|
| Time zone meeting planner | Working hours become instants with the SDK's `expandRecurrence` (IANA zones, DST-safe, the function Δt calendars use), then a plain intersection. Unit-tested on the March weeks when US and EU clocks differ, a 23-hour day, overnight shifts. | None: zone rules come from the runtime's IANA database. |
| Double-booking race | Two real `holds.place` calls on a demo calendar, sent together on separate connections; the reply is the engine's. | None. |
| AI agent booking | Real MCP tool calls through `@open-deltat/mcp` over an in-memory transport. The agent's words are a script, and the page says so. | Follows the MCP server automatically. |
| Booking API console | Real SDK calls on a demo calendar; SQL shown is what the SDK sends (`packages/client/src`). | SQL must be kept in step if the SDK's statements change. |
| MCP calendar, booking link | Steps from `docs/_content/quickstart.md` and the hosted MCP (`/mcp` answered 401 with OAuth discovery on 24.11.2026). | Follow the quickstart. |
| Availability widget | The existing `/embed/gym` route; the button snippet only links to a `https://delt.at/b/` URL. | None. |
| Templates | Rendered from `calendarGuide()`, the same data `how_to_model_calendars` returns, so it cannot drift from the examples. | None. |
| Two comparisons | Every competitor fact read on the vendor's own pages on 24.11.2026, linked, with the date on the page. | Re-read every few months; prices and features change. |

## Legal (German UG, public in the EU)

- **No health, legal or safety claims** on any page. No MDR question.
- **Trademarks:** competitors are named in text only, no logos. Facts are attributed and linked, which
  keeps comparative advertising factual (UWG § 6).
- **Data about the visitor:** nothing new is stored. The live tools use the demo site's existing
  visitor cookie (functional, already used by the demos) for rate limiting and for clearing the
  demo bookings after 30 seconds. Analytics is the existing cookieless Umami.
- **Content licences:** all text is ours. The time zone data is the IANA database in the browser and
  server runtime (public domain).
- **Verdict:** all ten pages fine as they are. The comparisons carry the line "Prices and features
  change; check each linked page before you decide."

## Dropped or reshaped

- **Hosted "book me" link with accounts:** already exists (an agent creates a calendar through the
  hosted MCP and gets a `delt.at/b/` link), so the page explains that flow instead of building one.
- **Hosted widget for anyone's calendar:** the embed route serves the demo schedule only. Your own
  calendar is shared through a booking button; embedding it means self-hosting the open-source route.
