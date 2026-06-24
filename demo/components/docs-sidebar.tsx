"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// The docs left rail: two sections that mirror the product split. Δt is the database, tap is how you
// use it. Active link is an exact path match (every entry is its own page).
const SECTIONS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Δt · the database",
    links: [
      { href: "/docs", label: "Overview" },
      { href: "/docs/data-model", label: "Data model" },
      { href: "/docs/holds-and-availability", label: "Holds and availability" },
      { href: "/docs/protocol-and-engine", label: "Protocol and engine" },
    ],
  },
  {
    title: "tap · the SDK",
    links: [
      { href: "/docs/sdk/quickstart", label: "Quickstart" },
      { href: "/docs/sdk/reference", label: "SDK reference" },
      { href: "/docs/sdk/self-host", label: "Self-host" },
    ],
  },
];

export function DocsSidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-full shrink-0 sm:w-56">
      <div className="flex gap-6 overflow-x-auto pb-2 sm:block sm:space-y-6 sm:overflow-visible sm:pb-0">
        {SECTIONS.map((section) => (
          <div key={section.title} className="shrink-0">
            <div className="mb-2 px-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">{section.title}</div>
            <nav className="flex gap-1 sm:block sm:space-y-0.5">
              {section.links.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "block whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                      active
                        ? "bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-400/20"
                        : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>
    </aside>
  );
}
