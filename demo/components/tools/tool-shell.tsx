import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { SiteFooter } from "@/components/site-footer";
import { ProductOffer } from "@/components/tools/product-offer";
import { breadcrumbLd } from "@/lib/seo";
import { TOOLS_HUB, type ToolPage } from "@/lib/tools/registry";

type Ld = Record<string, unknown>;

// The frame every page on the /tools hub shares: breadcrumb back to the hub, the one H1, a lead,
// then the tool itself first (where the eye already is), then the page's own sections, and last the
// product offer. The page scrolls itself because the root layout gives it a fixed-height box.
export function ToolShell({ tool, ld, lead, children }: { tool: ToolPage; ld: readonly Ld[]; lead: ReactNode; children: ReactNode }) {
  return (
    <div className="dt-canvas h-full overflow-auto text-dt-ink">
      <JsonLd
        graph={[
          ...ld,
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Tools", path: TOOLS_HUB.href },
            { name: tool.label, path: tool.href },
          ]),
        ]}
      />
      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8 sm:px-6 sm:pt-14">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[13px] text-dt-ink-3">
          <Link href={TOOLS_HUB.href} className="hover:text-dt-ink">
            Tools
          </Link>
          <ChevronRight className="size-3.5" aria-hidden />
          <span className="truncate text-dt-ink-2">{tool.label}</span>
        </nav>
        <header className="mt-4 max-w-3xl">
          <h1 className="text-balance text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[2.7rem]">{tool.h1}</h1>
          <div className="mt-4 text-pretty text-[16.5px] leading-relaxed text-dt-ink-2">{lead}</div>
        </header>
        <div className="mt-8 sm:mt-10">{children}</div>
        <ProductOffer event={tool.event} />
      </main>
      <SiteFooter />
    </div>
  );
}

// A titled block of the page below the tool. Body is markdown-rendered JSX or any node.
export function ToolSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-14 scroll-mt-20 sm:mt-20">
      <h2 className="text-balance text-[1.45rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[1.7rem]">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
