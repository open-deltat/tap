import { ArrowRight } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { SiteFooter } from "@/components/site-footer";
import { ProductOffer } from "@/components/tools/product-offer";
import { breadcrumbLd, collectionPageLd, pageMetadata } from "@/lib/seo";
import { TOOL_GROUPS, TOOLS, TOOLS_HUB, type ToolGroup } from "@/lib/tools/registry";

export const metadata = pageMetadata({ title: TOOLS_HUB.title, description: TOOLS_HUB.description, path: TOOLS_HUB.href });

const GROUP_ORDER: readonly ToolGroup[] = ["live", "setup", "compare"];

export default function ToolsHubPage() {
  return (
    <div className="dt-canvas h-full overflow-auto text-dt-ink">
      <JsonLd
        graph={[
          collectionPageLd({ ...TOOLS_HUB, path: TOOLS_HUB.href, items: TOOLS.map((t) => ({ name: t.label, path: t.href })) }),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Tools", path: TOOLS_HUB.href },
          ]),
        ]}
      />
      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
        <header className="max-w-2xl">
          <h1 className="text-balance text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[3rem]">{TOOLS_HUB.h1}</h1>
          <p className="mt-4 text-pretty text-[16.5px] leading-relaxed text-dt-ink-2">
            Free things to use, each on the live Δt engine: plan a meeting across time zones, watch two bookers race for one slot, see an agent
            book over MCP, or call the API yourself. No sign-in for any of them.
          </p>
        </header>

        {GROUP_ORDER.map((group) => (
          <section key={group} className="mt-12 sm:mt-14">
            <h2 className="text-[13px] font-medium text-dt-accent-ink">{TOOL_GROUPS[group]}</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {TOOLS.filter((t) => t.group === group).map((t) => (
                <li key={t.href}>
                  <a
                    href={t.href}
                    className="group flex h-full items-start gap-4 rounded-2xl border border-dt-line bg-dt-surface p-5 shadow-dt-surface transition-colors hover:border-dt-line-strong"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-dt-sunken text-dt-ink">
                      <t.icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15.5px] font-semibold tracking-tight">{t.label}</span>
                      <span className="mt-1 block text-[14px] leading-relaxed text-dt-ink-2">{t.blurb}</span>
                    </span>
                    <ArrowRight className="mt-1 size-4 shrink-0 text-dt-ink-3 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-dt-ink" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <ProductOffer event="hub" />
      </main>
      <SiteFooter />
    </div>
  );
}
