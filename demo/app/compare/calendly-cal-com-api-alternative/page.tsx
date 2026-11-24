import Link from "next/link";
import { ToolShell, ToolSection } from "@/components/tools/tool-shell";
import { CompareTable, type CompareColumn, type CompareRow } from "@/components/tools/compare-table";
import { Sources, type Source } from "@/components/tools/sources";
import { pageMetadata, techArticleLd } from "@/lib/seo";
import { toolByHref } from "@/lib/tools/registry";

const TOOL = toolByHref("/compare/calendly-cal-com-api-alternative");

export const metadata = pageMetadata({ title: TOOL.title, description: TOOL.description, path: TOOL.href });

const READ_ON = "24.11.2026";

const CALENDLY = {
  invitee: "https://developer.calendly.com/api-docs/calendly-api/scheduled-events/create-event-invitee",
  freePlan: "https://community.calendly.com/developer-faq-62/scheduling-api-post-invitees-and-webhooks-now-available-on-the-free-plan-6162",
  slots: "https://developer.calendly.com/api-docs/calendly-api/event-types/list-event-type-available-times.md",
  index: "https://developer.calendly.com/llms.txt",
  faq: "https://developer.calendly.com/frequently-asked-questions",
  mcp: "https://developer.calendly.com/docs/mcp/calendly-mcp-server.md",
  sync: "https://calendly.com/help/connect-your-calendar-to-calendly",
  pricing: "https://calendly.com/pricing",
  rateLimits: "https://developer.calendly.com/api-docs/overview/rate-limits.md",
} as const;
const CAL = {
  booking: "https://cal.com/docs/api-reference/v2/bookings/create-a-booking",
  slots: "https://cal.com/docs/api-reference/v2/slots/get-available-time-slots-for-an-event-type",
  reserve: "https://cal.com/docs/api-reference/v2/slots/reserve-a-slot",
  webhooks: "https://cal.com/docs/api-reference/v2/webhooks/create-a-webhook",
  mcp: "https://cal.com/docs/mcp-server",
  blog: "https://cal.com/blog/cal-diy-open-source-to-closed-source",
  repo: "https://github.com/calcom/cal.com",
  pricing: "https://cal.com/pricing",
  intro: "https://cal.com/docs/api-reference/v2/introduction",
  seats: "https://cal.com/help/event-types/offer-seats",
} as const;

const COLUMNS = [{ name: "Δt", ours: true }, { name: "Calendly API" }, { name: "Cal.com API" }] as const satisfies readonly CompareColumn[];

const ROWS = [
  {
    label: "Create a booking by API",
    cells: [
      "Yes: hold a slot, then commit it.",
      { text: "Yes, POST /invitees. On Free, capped at 5 bookings per user per day. Paid event types can't be booked this way.", href: CALENDLY.invitee },
      { text: "Yes, POST /v2/bookings.", href: CAL.booking },
    ],
  },
  {
    label: "Query free slots",
    cells: [
      "Yes, on one calendar or several. For several, only times when all are free.",
      { text: "Yes, GET /event_type_available_times, a range of at most 31 days.", href: CALENDLY.slots },
      { text: "Yes, GET /v2/slots.", href: CAL.slots },
    ],
  },
  {
    label: "Temporary slot hold",
    cells: [
      "Yes. The server enforces the expiry.",
      { text: "None found in their API docs.", href: CALENDLY.index },
      { text: "Yes, POST /v2/slots/reservations. Defaults to 5 minutes.", href: CAL.reserve },
    ],
  },
  {
    label: "Atomic booking of several people or resources",
    cells: [
      "Yes. Any calendars, all or none.",
      { text: "Collective event types, set up by the host. No API to book arbitrary resources together.", href: CALENDLY.index },
      { text: "Dynamic groups and collective events. A transaction guarantee is not stated.", href: CAL.booking },
    ],
  },
  {
    label: "Webhooks",
    cells: [
      "A live change stream instead (listen and watch).",
      { text: "Yes, on all plans including Free.", href: CALENDLY.faq },
      { text: "Yes, POST /v2/webhooks.", href: CAL.webhooks },
    ],
  },
  {
    label: "MCP server",
    cells: [
      "Yes. Hosted at delt.at/mcp, and open source as @open-deltat/mcp.",
      { text: "Yes, hosted at mcp.calendly.com.", href: CALENDLY.mcp },
      { text: "Yes, hosted at mcp.cal.com/mcp, or run npx @calcom/cal-mcp.", href: CAL.mcp },
    ],
  },
  {
    label: "Open source and self-host",
    cells: [
      "Yes. Server AGPL-3.0, SDK MIT. One binary or Docker.",
      "No.",
      { text: "The main product went closed source in 2026. The public repo is Cal.diy (MIT), \"strictly recommended for personal, non-production use\".", href: CAL.blog },
    ],
  },
  {
    label: "Google and Outlook sync",
    cells: [
      "No, by design.",
      { text: "Yes: Google, Office 365 and Outlook.com, Exchange.", href: CALENDLY.sync },
      "Not checked.",
    ],
  },
  {
    label: "What it models",
    cells: [
      "Any resource with capacity: people, rooms, seats, tables, machines.",
      { text: "People's meetings: one-on-one, group, collective, round robin. Rooms and equipment not found.", href: CALENDLY.index },
      { text: "People's meetings, plus seats: more than one attendee can book the same slot.", href: CAL.seats },
    ],
  },
  {
    label: "Price",
    cells: [
      "Self-hosting is free. Hosted is a pilot; see pricing.",
      { text: "Free; Standard $10 per seat a month; Teams $16; Enterprise from $15k a year.", href: CALENDLY.pricing },
      { text: "Individuals free; Teams $12 per user a month billed yearly ($16 monthly); Organizations $28 yearly ($37 monthly).", href: CAL.pricing },
    ],
  },
  {
    label: "Rate limits",
    cells: [
      "Self-hosted: yours to set.",
      { text: "500 requests per user per minute on paid plans, 50 on Free.", href: CALENDLY.rateLimits },
      { text: "120 requests per minute with an API key.", href: CAL.intro },
    ],
  },
] as const satisfies readonly CompareRow[];

const SOURCES = [
  { label: "Calendly: create event invitee", href: CALENDLY.invitee },
  { label: "Calendly: invitees and webhooks on Free", href: CALENDLY.freePlan },
  { label: "Calendly: event type available times", href: CALENDLY.slots },
  { label: "Calendly: API docs index", href: CALENDLY.index },
  { label: "Calendly: developer FAQ", href: CALENDLY.faq },
  { label: "Calendly: MCP server", href: CALENDLY.mcp },
  { label: "Calendly: connect your calendar", href: CALENDLY.sync },
  { label: "Calendly: pricing", href: CALENDLY.pricing },
  { label: "Calendly: rate limits", href: CALENDLY.rateLimits },
  { label: "Cal.com: create a booking", href: CAL.booking },
  { label: "Cal.com: get available slots", href: CAL.slots },
  { label: "Cal.com: reserve a slot", href: CAL.reserve },
  { label: "Cal.com: create a webhook", href: CAL.webhooks },
  { label: "Cal.com: MCP server", href: CAL.mcp },
  { label: "Cal.com: Cal.diy and closed source", href: CAL.blog },
  { label: "Cal.com: public repository", href: CAL.repo },
  { label: "Cal.com: pricing", href: CAL.pricing },
  { label: "Cal.com: API introduction", href: CAL.intro },
  { label: "Cal.com: seats", href: CAL.seats },
] as const satisfies readonly Source[];

const LINK = "text-dt-accent-ink underline decoration-dt-accent/40 underline-offset-4";
const PROSE = "mt-3 max-w-[68ch] text-[15.5px] leading-relaxed text-dt-ink-2";

export default function CalendlyAlternativePage() {
  return (
    <ToolShell
      tool={TOOL}
      ld={[techArticleLd({ title: TOOL.title, description: TOOL.description, path: TOOL.href })]}
      lead={
        <p>
          Calendly and Cal.com are booking products with an API. Δt is a booking engine you build on. They overlap less than the search
          results suggest, so here is the same job done three ways, read from their own docs. We build Δt, so every competitor cell links to
          its source.
        </p>
      }
    >
      <CompareTable caption="Δt compared with the Calendly API and the Cal.com API" columns={COLUMNS} rows={ROWS} />
      <p className="mt-3 max-w-[68ch] text-[13.5px] leading-relaxed text-dt-ink-3">
        A cell without a link is either about Δt or a plain no. Hosted Δt pricing is on the{" "}
        <Link href="/#pricing" className={LINK}>
          pricing section
        </Link>
        .
      </p>

      <ToolSection title="When Calendly or Cal.com is the better choice">
        <p className={PROSE}>
          If you want booking pages without writing code, they are the faster start: you set up an event type, share the link, and you are
          done. Calendly also syncs with Google, Office 365 and Exchange, so your existing diary decides what is free. Round robin is built
          in. Δt does not read your other calendars, so none of that comes with it.
        </p>
        <p className={PROSE}>
          Cal.com has a real slot reservation, five minutes by default, so the hold gap is covered for people&rsquo;s meetings. We did not
          compare payments or routing forms; check their pages if you need them.
        </p>
      </ToolSection>

      <ToolSection title="When Δt fits better">
        <p className={PROSE}>
          Pick Δt when the thing being booked is not only a person: a room, a seat, a table, a machine, or several of them together.
          Holds expire on their own and a commit across any calendars is all or none, so nobody is left holding half a booking. Calendars
          can have places, so a class of twelve is one calendar with capacity twelve.
        </p>
        <p className={PROSE}>
          You can run it yourself under AGPL-3.0, and agents get a hold-then-commit flow over MCP. To see what a hold does under pressure,
          run{" "}
          <Link href="/tools/double-booking-race" className={LINK}>
            the double-booking race
          </Link>
          . For the wider field of calendar APIs, read{" "}
          <Link href="/compare/calendar-apis" className={LINK}>
            Calendar APIs compared
          </Link>
          .
        </p>
      </ToolSection>

      <Sources read={READ_ON} items={SOURCES} note="Prices and features change; check each linked page before you decide." />
    </ToolShell>
  );
}
