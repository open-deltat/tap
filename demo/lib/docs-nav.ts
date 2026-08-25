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

export const DOCS_SECTIONS: DocsSection[] = [
  {
    title: "Δt · the database",
    links: [
      { href: "/docs", label: "What is Δt" },
      { href: "/docs/data-model", label: "Data model" },
      { href: "/docs/holds-and-availability", label: "Holds and availability" },
      { href: "/docs/protocol-and-engine", label: "Under the hood" },
    ],
  },
  {
    title: "TAP · the protocol",
    links: [
      { href: "/docs/sdk", label: "What is TAP" },
      { href: "/docs/sdk/quickstart", label: "Quickstart" },
      { href: "/docs/sdk/reference", label: "SDK reference" },
      { href: "/docs/sdk/self-host", label: "Self-host" },
    ],
  },
  {
    title: "Guides · in practice",
    links: [
      { href: "/docs/guides/prevent-double-booking", label: "Double bookings" },
      { href: "/docs/guides/booking-holds", label: "Booking holds" },
      { href: "/docs/guides/capacity", label: "Capacity and pools" },
      { href: "/docs/guides/buffer-time", label: "Buffer time" },
      { href: "/docs/guides/recurring-availability", label: "Recurring availability" },
      { href: "/docs/guides/scheduling-database", label: "Why a time database" },
      { href: "/docs/guides/postgres-wire", label: "Any Postgres client" },
    ],
  },
];

export const DOCS_PATHS: string[] = DOCS_SECTIONS.flatMap((s) => s.links.map((l) => l.href));
