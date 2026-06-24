import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { enabledExamples, type ExampleMeta } from "@/examples/manifest";
import { pageMetadata, SITE } from "@/lib/seo";

export const metadata = pageMetadata({
  title: SITE.defaultTitle,
  description: SITE.description,
  path: "/",
});

// The landing page: a gallery of every example, grouped, with the headline demos featured large.
// The top bar (root layout) carries the logo + docs link; this page is the example index.
export default function Home() {
  const all = enabledExamples();
  const featured = all.filter((e) => e.group === "featured");
  const seats = all.filter((e) => e.group === "seats");
  const spaces = all.filter((e) => e.group === "spaces");

  return (
    <div className="relative h-full overflow-auto bg-[#0a0a0c] text-zinc-100">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/4 h-[55vh] w-[55vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-[130px]" />
        <div className="absolute inset-0 opacity-[0.035] [background-image:radial-gradient(circle,#ffffff_1px,transparent_1px)] [background-size:22px_22px]" />
      </div>

      <main className="relative mx-auto max-w-5xl px-6 py-16">
        <header className="mx-auto max-w-2xl text-center">
          <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">What is Δt?</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-[2.6rem] sm:leading-[1.1]">
            A database for time.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-zinc-400">
            Space has three dimensions; time is the fourth, a single line. Δt is the database for
            that line, and{" "}
            <a href="/docs/sdk/quickstart" className="text-zinc-200 underline decoration-emerald-400/50 underline-offset-2 transition-colors hover:decoration-emerald-300">
              tap
            </a>{" "}
            is how you manage time in one dimension. Every demo below runs on it, live.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            <a
              href="/docs"
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1.5 text-[13px] font-medium text-emerald-200 transition-colors hover:border-emerald-400/50 hover:bg-emerald-400/15"
            >
              What is Δt
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
            <a
              href="/docs/sdk"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.03] px-4 py-1.5 text-[13px] font-medium text-zinc-300 transition-colors hover:border-white/25 hover:text-zinc-100"
            >
              What is tap
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </header>

        <Section title="Featured">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {featured.map((e) => (
              <FeaturedCard key={e.id} e={e} />
            ))}
          </div>
        </Section>

        <div className="mt-4 grid grid-cols-1 gap-x-10 gap-y-2 sm:grid-cols-2">
          <Section title="Seat maps">
            <div className="grid gap-2">
              {seats.map((e) => (
                <RowCard key={e.id} e={e} />
              ))}
            </div>
          </Section>
          <Section title="Spaces">
            <div className="grid gap-2">
              {spaces.map((e) => (
                <RowCard key={e.id} e={e} />
              ))}
            </div>
          </Section>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-[11px] uppercase tracking-[0.2em] text-zinc-500">{title}</h2>
      {children}
    </section>
  );
}

function FeaturedCard({ e }: { e: ExampleMeta }) {
  return (
    <a
      href={e.href}
      className="group block overflow-hidden rounded-2xl border border-emerald-400/20 bg-[#0a0a0c] transition-colors hover:border-emerald-400/40"
    >
      {/* The actual example, rendered live and chrome-free; the card click opens the full page. */}
      <div className="pointer-events-none relative aspect-[16/10] overflow-hidden border-b border-white/[0.06]">
        <iframe
          src={`/embed/${e.id}`}
          title={e.label}
          loading="lazy"
          tabIndex={-1}
          aria-hidden
          className="absolute left-0 top-0 origin-top-left border-0"
          style={{ width: "250%", height: "250%", transform: "scale(0.4)" }}
        />
      </div>
      <div className="flex items-center justify-between gap-2 p-3.5">
        <div>
          <div className="text-sm font-semibold text-zinc-100">{e.label}</div>
          <div className="mt-0.5 text-[12px] text-zinc-400">{e.tagline}</div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-emerald-300/70 transition-colors group-hover:text-emerald-200" />
      </div>
    </a>
  );
}

function RowCard({ e }: { e: ExampleMeta }) {
  const Icon = e.icon;
  return (
    <a
      href={e.href}
      className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 transition-colors hover:border-emerald-400/30 hover:bg-white/[0.04]"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-zinc-300 transition-colors group-hover:text-emerald-300">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-zinc-100">{e.label}</div>
        <div className="truncate text-[11px] text-zinc-500">{e.tagline}</div>
      </div>
      {e.specId && <span className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-wider text-zinc-600">{e.specId}</span>}
    </a>
  );
}
