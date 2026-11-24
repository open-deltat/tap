import Link from "next/link";
import { ToolShell, ToolSection } from "@/components/tools/tool-shell";
import { CompareTable, type CompareColumn, type CompareRow } from "@/components/tools/compare-table";
import { Sources, type Source } from "@/components/tools/sources";
import { pageMetadata, techArticleLd } from "@/lib/seo";
import { toolByHref } from "@/lib/tools/registry";

const TOOL = toolByHref("/compare/calendar-apis");

export const metadata = pageMetadata({ title: TOOL.title, description: TOOL.description, path: TOOL.href });

const READ_ON = "24.11.2026";

const GOOGLE = {
  overview: "https://developers.google.com/calendar/api/guides/overview",
  events: "https://developers.google.com/calendar/api/v3/reference/events",
  push: "https://developers.google.com/calendar/api/guides/push",
  mcp: "https://developers.google.com/workspace/calendar/api/v3/reference/mcp",
  quota: "https://developers.google.com/calendar/api/guides/quota",
  freebusy: "https://developers.google.com/calendar/api/v3/reference/freebusy/query",
} as const;
const NYLAS = {
  start: "https://developer.nylas.com/docs/v3/getting-started/",
  availability: "https://developer.nylas.com/docs/v3/calendar/calendar-availability/",
  scheduler: "https://developer.nylas.com/docs/v3/scheduler/",
  notifications: "https://developer.nylas.com/docs/v3/notifications/",
  mcp: "https://developer.nylas.com/docs/dev-guide/mcp/",
  pricing: "https://www.nylas.com/pricing/",
} as const;
const CRONOFY = {
  alternative: "https://www.cronofy.com/nylas-alternative",
  developers: "https://docs.cronofy.com/developers/",
  availableTimes: "https://docs.cronofy.com/schedule/scheduling-and-booking/available-times/",
  push: "https://docs.cronofy.com/developers/push-notifications/",
  mcp: "https://www.cronofy.com/developer/mcp-server",
  pricing: "https://www.cronofy.com/api-pricing",
  rateLimits: "https://docs.cronofy.com/developers/faqs/application-management/rate-limits/",
} as const;

const COLUMNS = [{ name: "Δt", ours: true }, { name: "Google Calendar API" }, { name: "Nylas" }, { name: "Cronofy" }] as const satisfies readonly CompareColumn[];

const ROWS = [
  {
    label: "What it is",
    cells: [
      "An open-source real-time calendar and booking engine. You own the calendars.",
      { text: "An API to Google's own calendars.", href: GOOGLE.overview },
      { text: "One API in front of people's existing calendars: Google, Microsoft, Exchange, iCloud, IMAP.", href: NYLAS.start },
      { text: "A sync layer over Google Calendar, Microsoft 365, Outlook.com, Exchange and iCloud.", href: CRONOFY.alternative },
    ],
  },
  {
    label: "Slot hold that expires on its own",
    cells: [
      "Yes. The server enforces the expiry.",
      { text: "No. Events can be tentative, with no expiry.", href: GOOGLE.events },
      { text: "None documented. Scheduler checks the slot is still free before it books.", href: NYLAS.scheduler },
      { text: "None found. Tentative events count as busy, with no expiry.", href: CRONOFY.availableTimes },
    ],
  },
  {
    label: "Atomic booking across calendars",
    cells: ["Yes. Several calendars, all or none.", { text: "Not documented.", href: GOOGLE.events }, { text: "Not stated.", href: NYLAS.scheduler }, "Not stated on the pages we read."],
  },
  {
    label: "Live change notifications",
    cells: [
      "Yes. A live stream of changes, also over WebSocket on the demo site.",
      { text: "Push channels. The message has no body, and channels must be renewed by hand.", href: GOOGLE.push },
      { text: "Webhooks, at-least-once, signed.", href: NYLAS.notifications },
      { text: "Push channels with a callback URL.", href: CRONOFY.push },
    ],
  },
  {
    label: "MCP server",
    cells: [
      "Yes. Hosted at delt.at/mcp, and open source as @open-deltat/mcp.",
      { text: "Yes, an official Google Calendar MCP server.", href: GOOGLE.mcp },
      { text: "Yes, a hosted Nylas MCP server.", href: NYLAS.mcp },
      { text: "Yes, a Cronofy MCP server.", href: CRONOFY.mcp },
    ],
  },
  {
    label: "Open source and self-host",
    cells: ["Yes. Server AGPL-3.0, SDK MIT. One binary or Docker.", "No. Google hosts it.", "No.", "No. A managed service, with a choice of data region."],
  },
  {
    label: "Reads people's existing Google or Outlook calendars",
    cells: [
      "No, by design.",
      { text: "Google calendars only.", href: GOOGLE.overview },
      { text: "Yes.", href: NYLAS.start },
      { text: "Yes.", href: CRONOFY.alternative },
    ],
  },
  {
    label: "Price",
    cells: [
      "Self-hosting is free. Hosted is a pilot; see pricing.",
      { text: "No extra cost for standard use.", href: GOOGLE.quota },
      { text: "Free at $0 a month (5 connected accounts), then $15 and $49 a month.", href: NYLAS.pricing },
      { text: "From $819 a month.", href: CRONOFY.pricing },
    ],
  },
  {
    label: "Rate limits",
    cells: [
      "Self-hosted: yours to set.",
      { text: "10,000 requests a minute per project, 600 per user per project.", href: GOOGLE.quota },
      "Not checked.",
      { text: "50 requests a second and 500 a minute by default.", href: CRONOFY.rateLimits },
    ],
  },
] as const satisfies readonly CompareRow[];

const SOURCES = [
  { label: "Google Calendar API overview", href: GOOGLE.overview },
  { label: "Google: freebusy.query", href: GOOGLE.freebusy },
  { label: "Google: events", href: GOOGLE.events },
  { label: "Google: push notifications", href: GOOGLE.push },
  { label: "Google Calendar MCP server", href: GOOGLE.mcp },
  { label: "Google: quota", href: GOOGLE.quota },
  { label: "Nylas: getting started", href: NYLAS.start },
  { label: "Nylas: availability", href: NYLAS.availability },
  { label: "Nylas: Scheduler", href: NYLAS.scheduler },
  { label: "Nylas: notifications", href: NYLAS.notifications },
  { label: "Nylas: MCP", href: NYLAS.mcp },
  { label: "Nylas: pricing", href: NYLAS.pricing },
  { label: "Cronofy: Nylas alternative", href: CRONOFY.alternative },
  { label: "Cronofy: developer docs", href: CRONOFY.developers },
  { label: "Cronofy: available times", href: CRONOFY.availableTimes },
  { label: "Cronofy: push notifications", href: CRONOFY.push },
  { label: "Cronofy: MCP server", href: CRONOFY.mcp },
  { label: "Cronofy: API pricing", href: CRONOFY.pricing },
  { label: "Cronofy: rate limits", href: CRONOFY.rateLimits },
] as const satisfies readonly Source[];

const LINK = "text-dt-accent-ink underline decoration-dt-accent/40 underline-offset-4";
const PROSE = "mt-3 max-w-[68ch] text-[15.5px] leading-relaxed text-dt-ink-2";

export default function CalendarApisPage() {
  return (
    <ToolShell
      tool={TOOL}
      ld={[techArticleLd({ title: TOOL.title, description: TOOL.description, path: TOOL.href })]}
      lead={
        <p>
          Four ways to put a calendar behind your own booking flow. We build one of them, so each cell links to the page it was read on, and
          the section after the table says when you should pick something else.
        </p>
      }
    >
      <CompareTable caption="Calendar APIs compared: Δt, Google Calendar API, Nylas and Cronofy" columns={COLUMNS} rows={ROWS} />
      <p className="mt-3 max-w-[68ch] text-[13.5px] leading-relaxed text-dt-ink-3">
        A cell without a link is either about Δt or a plain no. Hosted Δt pricing is on the{" "}
        <Link href="/#pricing" className={LINK}>
          pricing section
        </Link>
        .
      </p>

      <ToolSection title="When to pick something else">
        <p className={PROSE}>
          <strong className="font-semibold text-dt-ink">Google Calendar API:</strong> pick it when you need the calendars people already
          use, and your people use Google. It costs nothing extra and it is the source of truth for those calendars. It has no hold that
          expires and no all-or-nothing booking across calendars, so you build those yourself.
        </p>
        <p className={PROSE}>
          <strong className="font-semibold text-dt-ink">Nylas or Cronofy:</strong> pick one when your product has to work with whatever
          calendar your customers have, Google, Microsoft, iCloud or Exchange, through one API. If you need compliance paperwork such as SOC 2
          or HIPAA, ask each vendor for its current terms; we did not compare them here.
        </p>
        <p className={PROSE}>
          <strong className="font-semibold text-dt-ink">Δt:</strong> pick it when the calendar is yours, not a mirror of someone else&rsquo;s.
          That means holds that expire on their own, booking several calendars all or none, agents that book through MCP, and the option
          to run it yourself. The price of that is the first row: it does not read the Google or Outlook calendars people already have.
          To see a hold decide between two bookers, run{" "}
          <Link href="/tools/double-booking-race" className={LINK}>
            the double-booking race
          </Link>
          . If you are weighing Δt against Calendly or Cal.com instead, read{" "}
          <Link href="/compare/calendly-cal-com-api-alternative" className={LINK}>
            the Calendly and Cal.com comparison
          </Link>
          .
        </p>
      </ToolSection>

      <Sources read={READ_ON} items={SOURCES} note="Prices and features change; check each linked page before you decide." />
    </ToolShell>
  );
}
