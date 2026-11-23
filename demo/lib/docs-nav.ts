import type { ExampleId } from "@open-deltat/examples/config";

// The single source of truth for the docs tree. The sidebar renders it and the sitemap derives
// every /docs URL from it, so adding a page here is what publishes it in both places.
export interface DocsLink {
  href: string;
  label: string;
  // The live demo that shows this page's idea running. Docs readers left after one page while demo
  // visitors stayed (Umami, 30 days to 23.11.2026), so every page names the demo to try next.
  demo: ExampleId;
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
      { href: "/docs", label: "What is Δt", demo: "availability" },
      { href: "/docs/quickstart", label: "Agent quickstart", demo: "availability" },
    ],
  },
  {
    title: "How it works",
    links: [
      { href: "/docs/holds-and-availability", label: "Find, hold, book, listen", demo: "live" },
      { href: "/docs/data-model", label: "Data model", demo: "restaurant" },
      { href: "/docs/protocol-and-engine", label: "Under the hood", demo: "live" },
    ],
  },
  {
    title: "Agents",
    links: [
      { href: "/docs/guides/ai-agent-scheduling", label: "Scheduling for AI agents", demo: "live" },
      { href: "/docs/guides/voice-agent-booking", label: "Voice agents that book", demo: "availability" },
      { href: "/docs/guides/real-time-scheduling", label: "Live updates", demo: "live" },
    ],
  },
  {
    title: "Build with code",
    links: [
      { href: "/docs/sdk/quickstart", label: "TypeScript quickstart", demo: "stadium" },
      { href: "/docs/sdk/reference", label: "SDK reference", demo: "stadium" },
      { href: "/docs/guides/postgres-wire", label: "Any Postgres client", demo: "availability" },
      { href: "/docs/sdk/self-host", label: "Self-host", demo: "availability" },
    ],
  },
  {
    title: "Guides",
    links: [
      { href: "/docs/guides/prevent-double-booking", label: "Double bookings", demo: "live" },
      { href: "/docs/guides/booking-holds", label: "Booking holds", demo: "live" },
      { href: "/docs/guides/capacity", label: "Capacity and pools", demo: "parking" },
      { href: "/docs/guides/buffer-time", label: "Buffer time", demo: "restaurant" },
      { href: "/docs/guides/recurring-availability", label: "Recurring hours", demo: "builder" },
    ],
  },
];

export const DOCS_PATHS: string[] = DOCS_SECTIONS.flatMap((s) => s.links.map((l) => l.href));

export function docsDemoOf(href: string): ExampleId | undefined {
  return DOCS_SECTIONS.flatMap((s) => s.links).find((l) => l.href === href)?.demo;
}

// The section a page sits in, for its header eyebrow, so moving a page in the tree above moves its
// label too.
export function docsSectionOf(href: string): string {
  return DOCS_SECTIONS.find((s) => s.links.some((l) => l.href === href))?.title ?? "Docs";
}
