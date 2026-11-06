"use client";

import { usePathname } from "next/navigation";
import { docsSectionOf } from "@/lib/docs-nav";

// The page header shared by every docs page: the sidebar section the page sits in, and the title.
// The section comes from the docs tree, so moving a page there relabels it here.
export function DocHeader({ title }: { title: string }) {
  const section = docsSectionOf(usePathname() ?? "/docs");
  return (
    <header className="mb-8">
      <div className="text-[13px] font-medium text-dt-accent-ink">{section}</div>
      <h1 className="mt-2 text-balance text-[2rem] font-semibold leading-[1.15] tracking-[-0.025em] text-dt-ink sm:text-[2.4rem]">{title}</h1>
    </header>
  );
}
