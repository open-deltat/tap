"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { DOCS_SECTIONS } from "@/lib/docs-nav";
import { cn } from "@/lib/utils";

// The docs left rail. Δt is the database; TAP is the Time Allocation Protocol you reach it
// through; guides apply both to real scheduling problems. The tree itself lives in lib/docs-nav
// (shared with the sitemap). Active link is an exact path match.
//
// On a phone the rail sits behind one "Docs menu" button above the page, so the page itself keeps
// the whole screen and the tree never turns into a sideways-scrolling strip.

export function DocsSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = DOCS_SECTIONS.flatMap((s) => s.links).find((l) => l.href === pathname);

  return (
    <aside className="w-full shrink-0 sm:sticky sm:top-6 sm:w-60 sm:self-start">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="docs-nav"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-full items-center justify-between rounded-2xl border border-dt-line bg-dt-surface px-4 text-[14px] font-medium text-dt-ink shadow-dt-surface sm:hidden"
      >
        <span className="truncate">
          <span className="text-dt-ink-3">Docs menu</span>
          {current && <span className="ml-2">{current.label}</span>}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-dt-ink-3 transition-transform duration-200", open && "rotate-180")} />
      </button>

      <div
        id="docs-nav"
        className={cn(
          "mt-2 space-y-6 rounded-2xl border border-dt-line bg-dt-surface p-3 sm:mt-0 sm:block sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0",
          open ? "block" : "hidden"
        )}
      >
        {DOCS_SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="mb-1.5 px-3 text-[12px] font-medium text-dt-ink-3">{section.title}</div>
            <nav className="space-y-0.5">
              {section.links.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center rounded-xl px-3 text-[14px] transition-colors sm:min-h-0 sm:py-1.5 sm:text-[13.5px]",
                      active
                        ? "bg-dt-sunken font-medium text-dt-ink ring-1 ring-dt-line"
                        : "text-dt-ink-2 hover:bg-dt-sunken hover:text-dt-ink"
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
