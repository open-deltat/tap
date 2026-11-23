import { ArrowRight } from "lucide-react";
import { enabledExamples } from "@open-deltat/examples/manifest";
import { docsDemoOf, docsSectionOf } from "@/lib/docs-nav";

// The page header shared by every docs page: the sidebar section the page sits in, the title, and
// the live demo that shows the page's idea running. The page passes its own path (it already has it
// for its metadata), so section and demo are read from the docs tree on the server, with no client
// code; moving a page in the tree relabels it here.
export function DocHeader({ title, path }: { title: string; path: string }) {
  return (
    <header className="mb-8">
      <div className="text-[13px] font-medium text-dt-accent-ink">{docsSectionOf(path)}</div>
      <h1 className="mt-2 text-balance text-[2rem] font-semibold leading-[1.15] tracking-[-0.025em] text-dt-ink sm:text-[2.4rem]">{title}</h1>
      <SeeItWorking path={path} />
    </header>
  );
}

// Under the title, where every visitor sees it: docs landings almost never reached a second page, so a
// link at the end of the text would only reach the few who scroll there.
function SeeItWorking({ path }: { path: string }) {
  const id = docsDemoOf(path);
  // A single-purpose deployment (DEMO_EXAMPLES) may not serve this page's demo; then there is nothing to link.
  const demo = enabledExamples().find((e) => e.id === id);
  if (!demo) return null;
  const Icon = demo.icon;
  return (
    <a
      href={demo.href}
      data-umami-event="docs-see-it-working"
      data-umami-event-demo={demo.id}
      data-umami-event-page={path}
      className="group mt-5 flex items-center gap-3 rounded-2xl border border-dt-line bg-dt-surface p-3.5 shadow-dt-surface transition-colors hover:border-dt-line-strong sm:max-w-lg"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-dt-accent-soft text-dt-accent-ink">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-dt-ink">See it working</span>
        <span className="block text-[13px] text-dt-ink-3">
          {demo.label} demo · {demo.tagline}
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-dt-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </a>
  );
}
