import type { ReactNode } from "react";
import { ArrowRight, Check, Github } from "lucide-react";
import { enabledExamples, type ExampleMeta } from "@open-deltat/examples/manifest";
import { pageMetadata, SITE } from "@/lib/seo";

export const metadata = pageMetadata({
  title: SITE.defaultTitle,
  description: SITE.description,
  path: "/",
  absoluteTitle: true,
});

// delt.at has no inbound mail (no MX record), so the pilot CTA goes to the founder's published address.
const PILOT_MAILTO =
  "mailto:simonorzel@gmail.com?subject=" +
  encodeURIComponent("Δt founding pilot") +
  "&body=" +
  encodeURIComponent("What the agent books:\nHow many calendars or resources:\nWhere the calendar lives today:\n");

const PROBLEMS = [
  {
    title: "Agents read, think, then write",
    body: "An agent sees 14:30 free, spends seconds deciding and asking a human, then tries to book. Meanwhile someone else took it. Checking and booking are two moments, and the gap is a race.",
  },
  {
    title: "Nothing can be held",
    body: "There is no way to say “keep this for me while I ask”. So agents either book too early and cancel, or offer a time they cannot keep.",
  },
  {
    title: "Whoever polls fastest wins",
    body: "Every frontend copies the calendar on a timer. The site with the tightest loop beats the agent on a phone call, and every copy is a little out of date.",
  },
] as const;

const STEPS = [
  { verb: "find", tool: "find_slots", body: "What is free right now, across every calendar you name." },
  { verb: "hold", tool: "hold_slot", body: "Reserve it for a few minutes while the agent asks. Expires on its own." },
  { verb: "commit", tool: "commit_hold", body: "Turn the hold into a booking in one step. If it is gone, the refusal lists times that still work." },
  { verb: "listen", tool: "LISTEN", body: "Every open screen and agent is told the moment something changes, and re-reads." },
] as const;

type UseCase = { title: string; body: string; demo?: { href: string; label: string } };

// Use cases are what the kernel fits, not integrations that ship; the note under the grid says so.
const USE_CASES: readonly UseCase[] = [
  {
    title: "GPU servers",
    body: "Book one node or eight together for a training run. The agent holds the whole block while the budget is approved: all of it or none of it.",
  },
  {
    title: "Personal calendars",
    body: "An assistant agent finds a time that suits four people and holds it on all four calendars while it asks. Nobody else’s agent can take it in the meantime.",
  },
  {
    title: "Rentals on many channels",
    body: "A flat’s nights live in one calendar. Airbnb, Booking.com and your own site would all read from it and hear the moment a night is taken.",
  },
  {
    title: "Voice-agent appointments",
    body: "The caller asks for Tuesday. The agent holds 14:30 before it says it out loud, so the time it offers is the time it books.",
    demo: { href: "/docs/guides/voice-agent-booking", label: "Guide" },
  },
  {
    title: "Equipment and kit rental",
    body: "A camera, two lenses and a light booked as one kit, so a customer never gets the body without the glass.",
  },
  {
    title: "Lab instruments and test rigs",
    body: "A sequencer, a microscope or a hardware test bench shared between teams, their scripts and their agents.",
  },
  {
    title: "Event seats",
    body: "Thousands of people and their agents picking seats at once. A held seat greys out on every screen immediately.",
    demo: { href: "/demos/live", label: "Live demo" },
  },
  {
    title: "Rooms, desks and parking",
    body: "Anything with a fixed number of places and a time on it, from a parking zone to a meeting room.",
    demo: { href: "/demos/parking", label: "Live demo" },
  },
];

const PILOT_INCLUDES = [
  "A hosted Δt instance in the EU, run by the person who wrote it",
  "Your resources and opening hours imported for you",
  "The MCP server and TypeScript client wired into your agent: find, hold, commit",
  "A review of your booking flow for races before you go live",
  "A direct line to the founder while you build",
] as const;

export default function Home() {
  const all = enabledExamples();
  const featured = all.filter((e) => e.group === "featured");
  const seats = all.filter((e) => e.group === "seats");
  const spaces = all.filter((e) => e.group === "spaces");

  return (
    <div className="relative h-full overflow-auto bg-[#0a0a0c] text-zinc-100">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[90vh]">
        <div className="absolute left-1/2 top-1/3 h-[55vh] w-[55vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-[130px]" />
        <div className="absolute inset-0 opacity-[0.035] [background-image:radial-gradient(circle,#ffffff_1px,transparent_1px)] [background-size:22px_22px]" />
      </div>

      <main className="relative mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
        <header className="mx-auto max-w-4xl text-center">
          <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">Δt</div>
          <h1 className="mt-3 text-balance text-[2.1rem] font-semibold leading-[1.1] tracking-tight text-zinc-50 sm:text-[3.2rem]">
            Real-Time Calendars for Agents
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-zinc-400 sm:text-base">
            One calendar is the source of truth. Every agent and every frontend reads it live, holds a
            slot while it decides, and books it in one step. Nobody polls, and nothing is booked twice.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
            <a
              href="#pilot"
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400 px-5 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-emerald-300"
            >
              Start a pilot
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
            <a
              href="/docs/guides/ai-agent-scheduling"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.03] px-5 py-2 text-[13px] font-medium text-zinc-300 transition-colors hover:border-white/25 hover:text-zinc-100"
            >
              How agents book on it
            </a>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3.5 gap-y-2 text-[12px] text-zinc-500">
            <a
              href={SITE.github}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-zinc-300"
            >
              <Github className="h-3.5 w-3.5" />
              Open source
            </a>
            <span className="text-zinc-700">·</span>
            <code className="rounded bg-white/[0.04] px-2 py-0.5 font-mono text-[11.5px] text-zinc-400">
              npx @open-deltat/mcp
            </code>
          </div>
        </header>

        <Section title="Why calendars break for agents">
          <div className="grid gap-px overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.08] md:grid-cols-3">
            {PROBLEMS.map((p) => (
              <div key={p.title} className="bg-[#0d0d10] p-5">
                <h3 className="text-[14px] font-semibold text-zinc-100">{p.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">{p.body}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="How it works">
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.verb} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-semibold text-zinc-100">
                    <span className="mr-2 font-mono text-[12px] text-zinc-600">{i + 1}</span>
                    {s.verb}
                  </span>
                  <code className="font-mono text-[11px] text-emerald-300/80">{s.tool}</code>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">{s.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 max-w-3xl text-[13px] leading-relaxed text-zinc-500">
            Underneath is Δt, an open-source database whose one rule is that two bookings never occupy
            the same time. The refusal comes from the storage engine, not from code that checked first
            and hoped. It speaks the Postgres wire protocol, and ships with an MCP server and a
            TypeScript client.
          </p>
        </Section>

        <Section title="What people could run on it">
          <div className="grid gap-3 sm:grid-cols-2">
            {USE_CASES.map((u) => (
              <div key={u.title} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[14px] font-semibold text-zinc-100">{u.title}</h3>
                  {u.demo && (
                    <a
                      href={u.demo.href}
                      className="inline-flex shrink-0 items-center gap-1 text-[12px] text-emerald-300/80 transition-colors hover:text-emerald-200"
                    >
                      {u.demo.label}
                      <ArrowRight className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">{u.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-zinc-500">
            These are uses the database fits, not integrations that ship. There is no connector to
            Airbnb, Booking.com, Google Calendar or Outlook today.
          </p>
        </Section>

        <section id="pilot" className="mt-16 scroll-mt-6">
          <div className="grid overflow-hidden rounded-2xl border border-emerald-400/25 bg-[#0c0f0d] md:grid-cols-[1.1fr_1fr]">
            <div className="p-6 sm:p-8">
              <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-300/80">The offer</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">Founding pilot</h2>
              <p className="mt-3 text-[14px] leading-relaxed text-zinc-400">
                For a team putting an agent in front of something scarce, on a calendar you own. Your
                agent stops offering times it cannot keep, and you stop writing the hold, expiry and
                retry code yourself.
              </p>
              <div className="mt-6 flex items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight text-zinc-50">€990</span>
                <span className="text-[14px] text-zinc-400">per month</span>
              </div>
              <p className="mt-1.5 text-[12.5px] text-zinc-500">
                First five teams. Price locked for 12 months. Cancel any month.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <a
                  href={PILOT_MAILTO}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400 px-5 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-emerald-300"
                >
                  Start a pilot
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
                <a
                  href="/docs/sdk/self-host"
                  className="text-[13px] text-zinc-400 underline-offset-4 transition-colors hover:text-zinc-200 hover:underline"
                >
                  Or self-host it free (AGPL-3.0)
                </a>
              </div>
            </div>
            <div className="border-t border-emerald-400/15 bg-white/[0.015] p-6 sm:p-8 md:border-l md:border-t-0">
              <h3 className="text-[12px] uppercase tracking-[0.18em] text-zinc-500">Included</h3>
              <ul className="mt-4 space-y-3">
                {PILOT_INCLUDES.map((item) => (
                  <li key={item} className="flex gap-2.5 text-[13.5px] leading-snug text-zinc-300">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-[12.5px] leading-relaxed text-zinc-500">
                Not included yet: connectors to outside calendars or booking channels. If you need one,
                it is the first thing we scope together.
              </p>
            </div>
          </div>
        </section>

        <Section title="See it live">
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
    <section className="mt-14">
      <h2 className="mb-4 text-[11px] uppercase tracking-[0.2em] text-zinc-500">{title}</h2>
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
