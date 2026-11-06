// The single source of truth for the docs tree. The sidebar renders it and the sitemap derives
// every /docs URL from it, so adding a page here is what publishes it in both places.
export interface DocsLink {
  href: string;
  label: string;
}

export interface DocsSection {
  title: string;
  links: DocsLink[];
}

// Ordered for the reader the product is for: someone giving an agent a calendar. Start, then how it
// works, then agent patterns, then building with code, then the narrower guides.
export const DOCS_SECTIONS: DocsSection[] = [
  {
    title: "Start",
    links: [
      { href: "/docs", label: "What is Δt" },
      { href: "/docs/quickstart", label: "Agent quickstart" },
    ],
  },
  {
    title: "How it works",
    links: [
      { href: "/docs/holds-and-availability", label: "Find, hold, book, listen" },
      { href: "/docs/data-model", label: "Data model" },
      { href: "/docs/protocol-and-engine", label: "Under the hood" },
    ],
  },
  {
    title: "Agents",
    links: [
      { href: "/docs/guides/ai-agent-scheduling", label: "Scheduling for AI agents" },
      { href: "/docs/guides/voice-agent-booking", label: "Voice agents that book" },
      { href: "/docs/guides/real-time-scheduling", label: "Live updates" },
    ],
  },
  {
    title: "Build with code",
    links: [
      { href: "/docs/sdk/quickstart", label: "TypeScript quickstart" },
      { href: "/docs/sdk/reference", label: "SDK reference" },
      { href: "/docs/guides/postgres-wire", label: "Any Postgres client" },
      { href: "/docs/sdk/self-host", label: "Self-host" },
    ],
  },
  {
    title: "Guides",
    links: [
      { href: "/docs/guides/prevent-double-booking", label: "Double bookings" },
      { href: "/docs/guides/booking-holds", label: "Booking holds" },
      { href: "/docs/guides/capacity", label: "Capacity and pools" },
      { href: "/docs/guides/buffer-time", label: "Buffer time" },
      { href: "/docs/guides/recurring-availability", label: "Recurring hours" },
    ],
  },
];

export const DOCS_PATHS: string[] = DOCS_SECTIONS.flatMap((s) => s.links.map((l) => l.href));

// The section a page sits in, for its header eyebrow, so moving a page in the tree above moves its
// label too.
export function docsSectionOf(href: string): string {
  return DOCS_SECTIONS.find((s) => s.links.some((l) => l.href === href))?.title ?? "Docs";
}
