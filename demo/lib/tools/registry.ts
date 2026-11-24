import { Bot, CalendarClock, Code2, Columns3, Globe2, LayoutTemplate, Link2, Plug, Scale, Swords, type LucideIcon } from "lucide-react";

// Every page the /tools hub lists, in one place. The hub, the sitemap, llms.txt and each page's
// own metadata read from here, so a page is published by adding it once. `event` is the Umami name:
// each page sends tool-<event>-use on its main action and tool-<event>-app on its product link.
export type ToolGroup = "live" | "setup" | "compare";

export interface ToolPage {
  readonly href: string;
  readonly event: string;
  readonly group: ToolGroup;
  readonly icon: LucideIcon;
  /** The hub card's name and the breadcrumb label. */
  readonly label: string;
  /** One line for the hub card. */
  readonly blurb: string;
  /** <title> without the brand suffix, and the H1 the page shows. */
  readonly title: string;
  readonly h1: string;
  /** 140 to 160 characters, per lib/seo. */
  readonly description: string;
}

export const TOOL_GROUPS: Record<ToolGroup, string> = {
  live: "Try it live",
  setup: "Set it up",
  compare: "Compare",
};

export const TOOLS = [
  {
    href: "/tools/timezone-meeting-planner",
    event: "timezone-planner",
    group: "live",
    icon: Globe2,
    label: "Time zone meeting planner",
    blurb: "Find the hours that work for everyone, across time zones and clock changes.",
    title: "Time zone meeting planner",
    h1: "Time zone meeting planner",
    description:
      "Add everyone's city and working hours, pick a day, and see the hours that overlap. Free, no sign-in, correct across daylight saving changes.",
  },
  {
    href: "/tools/double-booking-race",
    event: "double-booking-race",
    group: "live",
    icon: Swords,
    label: "The double-booking race",
    blurb: "Two people go for one slot at the same moment. Watch the hold decide.",
    title: "Booking hold: the double-booking race, live",
    h1: "The double-booking race",
    description:
      "Two bookers grab the same slot at the same instant on a live calendar. Both saw it free; only one hold wins. See the real reply the loser gets.",
  },
  {
    href: "/tools/ai-agent-booking",
    event: "agent-booking",
    group: "live",
    icon: Bot,
    label: "AI agent booking, live",
    blurb: "An agent finds, holds and books a slot over MCP, with a rival agent in the way.",
    title: "AI agent booking, live",
    h1: "AI agent booking, live",
    description:
      "Watch an agent find a free slot, hold it and book it through the real Δt MCP tools, and see what it gets back when another agent takes the time first.",
  },
  {
    href: "/tools/booking-api-console",
    event: "api-console",
    group: "live",
    icon: Code2,
    label: "Booking API console",
    blurb: "Run find, hold and commit against a live calendar and read the raw replies.",
    title: "Booking API with a live console",
    h1: "Booking API, live console",
    description:
      "A booking API you can try before you install anything: find free time, hold a slot, commit it and read every real reply from a live Δt calendar.",
  },
  {
    href: "/tools/mcp-calendar",
    event: "mcp-calendar",
    group: "setup",
    icon: Plug,
    label: "MCP calendar for Claude",
    blurb: "Connect Claude to a real calendar in two minutes.",
    title: "MCP calendar: connect Claude in two minutes",
    h1: "MCP calendar: connect Claude in two minutes",
    description:
      "Give Claude a calendar it can book on. Add one MCP URL, sign in, and ask it to make a calendar, find a time and book it. Free and open source.",
  },
  {
    href: "/tools/book-me-link",
    event: "book-me-link",
    group: "setup",
    icon: Link2,
    label: "Free booking link",
    blurb: "A link people use to book time with you, made by your AI assistant.",
    title: "Free booking link, made by your AI assistant",
    h1: "A free booking link for anyone",
    description:
      "Get a link people can book time with you on. Ask your AI assistant for it in one sentence, share it anywhere, and see every booking on your dashboard.",
  },
  {
    href: "/tools/availability-widget",
    event: "availability-widget",
    group: "setup",
    icon: CalendarClock,
    label: "Availability widget",
    blurb: "Put a live schedule or a booking button on any website.",
    title: "Availability widget for any website",
    h1: "Availability widget",
    description:
      "Embed a live, read-only schedule on any site, or a Book a time button that opens your delt.at booking link. Copy the snippet, paste it, done.",
  },
  {
    href: "/templates",
    event: "templates",
    group: "setup",
    icon: LayoutTemplate,
    label: "Booking templates",
    blurb: "Hotel rooms, theatre seats, meeting rooms and more, each with a live demo.",
    title: "Booking templates: hotel, theatre, meeting rooms",
    h1: "Booking templates by business",
    description:
      "How to set up hotel rooms, theatre seats, restaurant tables, classes, parking and meeting rooms as calendars, each with a live demo and the agent calls.",
  },
  {
    href: "/compare/calendar-apis",
    event: "calendar-apis",
    group: "compare",
    icon: Columns3,
    label: "Calendar APIs compared",
    blurb: "Google Calendar, Nylas, Cronofy and Δt, side by side.",
    title: "Calendar APIs compared: Google, Nylas, Cronofy",
    h1: "Calendar APIs compared",
    description:
      "Google Calendar API, Nylas, Cronofy and Δt compared on holds, atomic booking, live updates, MCP, self-hosting and price, from each vendor's own pages.",
  },
  {
    href: "/compare/calendly-cal-com-api-alternative",
    event: "calendly-alternative",
    group: "compare",
    icon: Scale,
    label: "Calendly and Cal.com API alternative",
    blurb: "When their booking APIs fit, and when a booking engine fits better.",
    title: "Calendly and Cal.com API alternative",
    h1: "A Calendly and Cal.com API alternative",
    description:
      "Calendly API and Cal.com API compared with Δt on booking, holds, free slots, MCP, self-hosting and plans, from their own docs, and when each is the better pick.",
  },
] as const satisfies readonly ToolPage[];

export type ToolHref = (typeof TOOLS)[number]["href"];

export function toolByHref(href: ToolHref): ToolPage {
  const tool = TOOLS.find((t) => t.href === href);
  if (!tool) throw new Error(`No tool page at ${href}`);
  return tool;
}

export const TOOLS_HUB = {
  href: "/tools",
  title: "Free scheduling tools and live booking demos",
  h1: "Tools",
  description:
    "Free tools on a live booking engine: a time zone planner, the double-booking race, an agent booking over MCP, an API console, templates and honest comparisons.",
} as const;
