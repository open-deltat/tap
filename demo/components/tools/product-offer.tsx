import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DeltatMark } from "@/components/deltat-mark";

// The quiet last word on every tools page: what Δt is, in the repo's own terms (open source, run it
// yourself, or connect an agent to the hosted MCP), and one link to the product.
export function ProductOffer({ event }: { event: string }) {
  return (
    <aside className="mt-16 flex flex-col gap-5 rounded-3xl border border-dt-line bg-dt-surface p-6 shadow-dt-surface sm:mt-24 sm:flex-row sm:items-center sm:p-7">
      <DeltatMark className="shrink-0" />
      <p className="flex-1 text-pretty text-[15px] leading-relaxed text-dt-ink-2">
        <span className="font-semibold text-dt-ink">Δt is an open-source calendar that people and agents book on.</span> Self-host it for
        free, or connect your agent to the hosted MCP at delt.at/mcp.
      </p>
      <Link
        href="/"
        data-umami-event={`tool-${event}-app`}
        data-umami-event-from="offer"
        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-dt-ink px-5 text-[14px] font-semibold text-dt-on-ink transition-[background-color,transform] duration-150 hover:bg-dt-ink/85 active:scale-[0.98]"
      >
        See Δt
        <ArrowRight className="h-4 w-4" />
      </Link>
    </aside>
  );
}
