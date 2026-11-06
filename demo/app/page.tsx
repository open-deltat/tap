import type { ReactNode } from "react";
import {
  ArrowRight,
  Camera,
  CalendarDays,
  Car,
  Check,
  Cpu,
  FlaskConical,
  Github,
  Home as HomeIcon,
  PhoneCall,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import { enabledExamples, type ExampleMeta } from "@open-deltat/examples/manifest";
import { pageMetadata, SITE } from "@/lib/seo";

export const metadata = pageMetadata({
  title: SITE.defaultTitle,
  description: SITE.description,
  path: "/",
  absoluteTitle: true,
});

// delt.at has no inbound mail (no MX record), so every sales CTA goes to the founder's published address.
const mailto = (subject: string, body: string) =>
  `mailto:simonorzel@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
const PILOT_MAILTO = mailto(
  "Δt founding pilot",
  "What the agent books:\nHow many calendars or resources:\nWhere the calendar lives today:\n"
);
const ENTERPRISE_MAILTO = mailto("Δt enterprise", "Company:\nWhat you want to run on Δt:\nSelf-hosted or managed:\n");

// Every line here is a property the code enforces today; nothing is a roadmap item.
const SPECS = [
  { k: "Double bookings", v: "Impossible", note: "Enforced by the storage engine" },
  { k: "Holds", v: "Built in", note: "Expire on their own" },
  { k: "Protocol", v: "TAP", note: "Time Allocation Protocol, over Postgres wire" },
  { k: "Agents", v: "MCP server", note: "On the official registry" },
] as const;

const PROBLEMS = [
  {
    title: "Agents read, think, then write",
    body: "An agent sees 14:30 free, spends seconds deciding and asking a human, then tries to book. By then someone else has it. Checking and booking are two moments, and the gap between them is a race.",
  },
  {
    title: "Nothing can be held",
    body: "Calendars have no way to say “keep this for me while I ask”. So agents book too early and cancel, or offer a time they cannot keep.",
  },
  {
    title: "Whoever polls fastest wins",
    body: "Every frontend copies the calendar on a timer. The site with the tightest loop beats the agent on a phone call, and every copy is a little out of date.",
  },
] as const;

const STEPS = [
  { tool: "find_slots", title: "Find", body: "What is free right now, across every calendar you name." },
  { tool: "hold_slot", title: "Hold", body: "The time is reserved for minutes while the agent asks. It expires on its own." },
  { tool: "commit_hold", title: "Commit", body: "The hold becomes a booking in one step. If it is gone, the refusal lists times that still work." },
  { tool: "LISTEN", title: "Listen", body: "Every screen and agent hears the moment anything changes, and re-reads." },
] as const;

type UseCase = { icon: LucideIcon; title: string; body: string; demo?: { href: string; label: string } };

const USE_CASES: readonly UseCase[] = [
  {
    icon: Cpu,
    title: "GPU clusters",
    body: "Eight nodes booked as one block for a training run: all of them or none. The agent holds the block while the budget clears.",
  },
  {
    icon: CalendarDays,
    title: "Personal calendars",
    body: "An assistant agent holds one time on four people’s calendars while it asks them. No other agent can take it in the meantime.",
  },
  {
    icon: HomeIcon,
    title: "Rentals on every channel",
    body: "A flat’s nights live in one calendar. Your site and every channel you connect hear the moment a night is taken.",
  },
  {
    icon: PhoneCall,
    title: "Voice-agent appointments",
    body: "The caller asks for Tuesday. The agent holds 14:30 before it says it out loud, so the time it offers is the time it books.",
    demo: { href: "/docs/guides/voice-agent-booking", label: "Guide" },
  },
  {
    icon: Camera,
    title: "Equipment and kit rental",
    body: "A camera, two lenses and a light go out as one kit. Nobody leaves with the body and no glass.",
  },
  {
    icon: FlaskConical,
    title: "Lab instruments and rigs",
    body: "A sequencer, a microscope or a test bench shared between teams, their scripts and their agents.",
  },
  {
    icon: Ticket,
    title: "Event seats",
    body: "Thousands of people and their agents pick seats at once. A held seat changes on every screen immediately.",
    demo: { href: "/demos/live", label: "Live demo" },
  },
  {
    icon: Car,
    title: "Rooms, desks and parking",
    body: "Anything with a fixed number of places and a time on it, from a parking zone to a meeting room.",
    demo: { href: "/demos/parking", label: "Live demo" },
  },
];

type Plan = {
  id: string;
  name: string;
  price: string;
  per?: string;
  blurb: string;
  features: readonly string[];
  cta: { label: string; href: string };
  featured?: boolean;
  footnote?: string;
};

// Self-hosting stays free and is named under the cards; the cards are what we sell.
const PLANS: readonly Plan[] = [
  {
    id: "pilot",
    name: "Founding pilot",
    price: "€990",
    per: "/ month",
    blurb: "For a team putting an agent in front of something scarce, on a calendar it owns.",
    features: [
      "Hosted Δt in the EU, run by the person who wrote it",
      "Your resources and hours imported for you",
      "MCP server and client wired into your agent",
      "A race review of your booking flow before go-live",
      "A direct line to the founder",
    ],
    cta: { label: "Start a pilot", href: PILOT_MAILTO },
    featured: true,
    footnote: "First five teams. Price locked for 12 months. Cancel any month.",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    blurb: "For closed-source products and fleets of calendars.",
    features: ["Commercial licence, no AGPL duties", "Dedicated deployment, yours or ours", "Connectors to your systems, scoped together", "Architecture review with the author"],
    cta: { label: "Talk to us", href: ENTERPRISE_MAILTO },
  },
];

export default function Home() {
  const all = enabledExamples();
  const featured = all.filter((e) => e.group === "featured");
  const rest = all.filter((e) => e.group === "seats" || e.group === "spaces");

  return (
    <div className="dt-canvas h-full overflow-auto text-dt-ink">
      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <a
              href={SITE.deltatRepo}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-dt-line bg-dt-surface px-3.5 py-1.5 text-[12.5px] text-dt-ink-2 shadow-dt-surface transition-colors hover:text-dt-ink"
            >
              <span className="dt-breathe h-1.5 w-1.5 rounded-full bg-dt-accent" />
              Δt 0.5 is out · open source
              <ArrowRight className="h-3 w-3" />
            </a>
            <h1 className="mt-7 text-balance text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[4.4rem]">
              Real-Time Calendars for Agents
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-pretty text-[17px] leading-relaxed text-dt-ink-2 sm:text-lg">
              One calendar is the source of truth. Every agent and every frontend reads it live, holds a slot while
              it decides, and books it in one step. Nobody polls. Nothing is ever booked twice.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href="#pricing" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-dt-ink px-7 text-[15px] font-semibold text-dt-on-ink transition-[background-color,transform] duration-150 hover:bg-dt-ink/85 active:scale-[0.98] sm:w-auto">
                Start a pilot
                <ArrowRight className="h-4 w-4" />
              </a>
              <a href="/docs/guides/ai-agent-scheduling" className="inline-flex h-12 w-full items-center justify-center rounded-full border border-dt-line-strong bg-dt-surface px-7 text-[15px] font-medium text-dt-ink transition-colors hover:bg-dt-sunken sm:w-auto">
                How agents book on it
              </a>
            </div>
            <div className="mt-5 font-mono text-[12.5px] text-dt-ink-3">
              <span className="select-none text-dt-ink-3/60">$ </span>npx @open-deltat/mcp
            </div>
          </div>

          <RaceVisual />
        </section>

        {/* Spec strip */}
        <section className="border-y border-dt-line bg-dt-surface/60">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 px-5 sm:px-6 lg:grid-cols-4">
            {SPECS.map((s, i) => (
              <div key={s.k} className={`py-7 sm:py-9 ${i % 2 === 1 ? "pl-5 sm:pl-8" : ""} ${i > 0 ? "lg:border-l lg:border-dt-line lg:pl-8" : ""} ${i >= 2 ? "border-t border-dt-line lg:border-t-0" : ""}`}>
                <dt className="text-[12.5px] text-dt-ink-3">{s.k}</dt>
                <dd className="mt-1.5 text-[1.35rem] font-semibold tracking-tight sm:text-2xl">{s.v}</dd>
                <dd className="mt-1 text-[12.5px] text-dt-ink-3">{s.note}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Problem */}
        <Section eyebrow="The problem" title="Calendars were built for people clicking. Agents race.">
          <div className="grid gap-4 md:grid-cols-3">
            {PROBLEMS.map((p, i) => (
              <div key={p.title} className="rounded-3xl border border-dt-line bg-dt-surface p-6 shadow-dt-surface">
                <div className="font-mono text-[12px] text-dt-ink-3">0{i + 1}</div>
                <h3 className="mt-3 text-[17px] font-semibold tracking-tight">{p.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-dt-ink-2">{p.body}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* How it works */}
        <Section eyebrow="How it works" title="Four verbs. No race left to lose.">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.05fr] lg:items-start">
            <ol className="grid gap-3">
              {STEPS.map((s, i) => (
                <li key={s.tool} className="flex gap-4 rounded-3xl border border-dt-line bg-dt-surface p-5 shadow-dt-surface">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-dt-ink font-mono text-[13px] font-semibold text-dt-on-ink">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h3 className="text-[16px] font-semibold tracking-tight">{s.title}</h3>
                      <code className="font-mono text-[12px] text-dt-accent-ink">{s.tool}</code>
                    </div>
                    <p className="mt-1 text-[14.5px] leading-relaxed text-dt-ink-2">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <CodeCard />
          </div>
          <p className="mt-8 max-w-3xl text-[15px] leading-relaxed text-dt-ink-2">
            Underneath is Δt, a database whose one rule is that two bookings never occupy the same time. The refusal
            comes from the storage engine, not from code that checked first and hoped. It speaks TAP, the Time
            Allocation Protocol, over the Postgres wire, so the Postgres driver you already use connects to it.
          </p>
        </Section>

        {/* Use cases */}
        <Section eyebrow="What teams run on Δt" title="Anything scarce, with a time on it.">
          <div className="grid gap-px overflow-hidden rounded-3xl border border-dt-line bg-dt-line sm:grid-cols-2 lg:grid-cols-4">
            {USE_CASES.map((u) => (
              <div key={u.title} className="relative flex flex-col bg-dt-surface p-6">
                <u.icon className="h-5 w-5 text-dt-ink" strokeWidth={1.75} />
                <h3 className="mt-5 text-[15.5px] font-semibold tracking-tight">{u.title}</h3>
                <p className="mt-1.5 flex-1 text-[14px] leading-relaxed text-dt-ink-2">{u.body}</p>
                {u.demo && (
                  <a href={u.demo.href} className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-dt-accent-ink after:absolute after:inset-0">
                    {u.demo.label}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* Pricing */}
        <Section id="pricing" eyebrow="Pricing" title="We run it. You ship the agent.">
          <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2 md:items-stretch">
            {PLANS.map((p) => (
              <div
                key={p.id}
                id={p.id}
                className={
                  p.featured
                    ? "relative flex scroll-mt-24 flex-col rounded-3xl bg-dt-ink p-7 text-dt-on-ink shadow-dt-float"
                    : "flex scroll-mt-24 flex-col rounded-3xl border border-dt-line bg-dt-surface p-7 shadow-dt-surface"
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[15px] font-semibold">{p.name}</h3>
                  {p.featured && (
                    <span className="rounded-full bg-dt-accent px-2.5 py-0.5 text-[11.5px] font-semibold text-[#04120c]">Five places</span>
                  )}
                </div>
                <div className="mt-5 flex items-baseline gap-1.5">
                  <span className="text-[2.6rem] font-semibold leading-none tracking-[-0.03em] tabular-nums">{p.price}</span>
                  {p.per && <span className={p.featured ? "text-[14px] opacity-70" : "text-[14px] text-dt-ink-3"}>{p.per}</span>}
                </div>
                <p className={`mt-3 text-[14px] leading-relaxed ${p.featured ? "opacity-80" : "text-dt-ink-2"}`}>{p.blurb}</p>
                <ul className="mt-6 flex-1 space-y-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2.5 text-[14px] leading-snug">
                      <Check className={`mt-0.5 h-4 w-4 shrink-0 ${p.featured ? "text-dt-accent" : "text-dt-accent-ink"}`} />
                      <span className={p.featured ? "opacity-90" : "text-dt-ink-2"}>{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={p.cta.href}
                  className={
                    p.featured
                      ? "mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-dt-on-ink text-[15px] font-semibold text-dt-ink transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98]"
                      : "mt-8 inline-flex h-12 items-center justify-center rounded-full border border-dt-line-strong text-[15px] font-medium text-dt-ink transition-colors hover:bg-dt-sunken"
                  }
                >
                  {p.cta.label}
                  {p.featured && <ArrowRight className="h-4 w-4" />}
                </a>
                {p.footnote && <p className="mt-3 text-center text-[12.5px] opacity-65">{p.footnote}</p>}
              </div>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-center text-[13.5px] leading-relaxed text-dt-ink-3">
            Running it yourself is free: the whole database is open source under AGPL-3.0, every feature included.{" "}
            <a href="/docs/sdk/self-host" className="whitespace-nowrap font-medium text-dt-ink underline decoration-dt-line-strong underline-offset-4 hover:decoration-dt-ink">
              Self-host it
            </a>
            . Connectors to outside calendars and booking channels are scoped per customer.
          </p>
        </Section>

        {/* Live examples */}
        <Section id="examples" eyebrow="See it live" title="Every example runs on Δt, right now.">
          <div className="grid gap-4 sm:grid-cols-2">
            {featured.map((e) => (
              <FeaturedCard key={e.id} e={e} />
            ))}
          </div>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {rest.map((e) => (
              <RowCard key={e.id} e={e} />
            ))}
          </div>
        </Section>

        {/* Closing CTA */}
        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-6">
          <div className="rounded-[32px] bg-dt-ink px-6 py-14 text-center text-dt-on-ink sm:px-12 sm:py-20">
            <h2 className="mx-auto max-w-2xl text-balance text-[2rem] font-semibold leading-tight tracking-[-0.03em] sm:text-[2.8rem]">
              Give your agent a calendar it can’t double-book.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[16px] leading-relaxed opacity-75">
              Five founding teams get Δt hosted, wired in and reviewed by its author. The price holds for a year.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href={PILOT_MAILTO} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-dt-on-ink px-7 text-[15px] font-semibold text-dt-ink transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98] sm:w-auto">
                Start a pilot
                <ArrowRight className="h-4 w-4" />
              </a>
              <a href={SITE.github} target="_blank" rel="noreferrer" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-dt-on-ink/25 px-7 text-[15px] font-medium transition-colors hover:bg-dt-on-ink/10 sm:w-auto">
                <Github className="h-4 w-4" />
                Read the source
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-dt-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 text-[13px] text-dt-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-dt-ink text-[11px] font-semibold text-dt-on-ink">Δt</span>
            <span>Real-Time Calendars for Agents</span>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
            <a href="/docs" className="hover:text-dt-ink">Docs</a>
            <a href={SITE.github} target="_blank" rel="noreferrer" className="hover:text-dt-ink">GitHub</a>
            <a href="https://www.npmjs.com/package/@open-deltat/mcp" target="_blank" rel="noreferrer" className="hover:text-dt-ink">npm</a>
            <a href="https://crates.io/crates/deltat" target="_blank" rel="noreferrer" className="hover:text-dt-ink">crates.io</a>
            <a href="/llms.txt" className="hover:text-dt-ink">llms.txt</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Section({ id, eyebrow, title, children }: { id?: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-16 px-5 py-16 sm:px-6 sm:py-24">
      <div className="mb-10 max-w-2xl sm:mb-12">
        <div className="text-[13px] font-medium text-dt-accent-ink">{eyebrow}</div>
        <h2 className="mt-2 text-balance text-[1.9rem] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[2.6rem]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

// The race every agent loses on a polled calendar, drawn as Δt answers it: the first hold wins, and
// the second agent gets a refusal that already carries times that still work (counter-offers ship
// in the kernel and the MCP server today).
function RaceVisual() {
  const slots = ["13:30", "14:00", "14:30", "15:00", "15:30", "16:00"];
  return (
    <div className="relative mx-auto mt-16 max-w-4xl sm:mt-20">
      <div className="rounded-[28px] border border-dt-line bg-dt-surface p-3 shadow-dt-float sm:p-4">
        <div className="flex items-center justify-between px-2 pb-3 pt-1 sm:px-3">
          <div className="flex items-center gap-2 text-[13px] font-medium">
            <span className="dt-breathe h-2 w-2 rounded-full bg-dt-accent" />
            Dr. Chen · Tuesday
          </div>
          <span className="font-mono text-[11.5px] text-dt-ink-3">resource 01J9…K2 · live</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-dt-sunken p-1.5 sm:grid-cols-6">
          {slots.map((t) => {
            const held = t === "14:30";
            const taken = t === "13:30";
            return (
              <div
                key={t}
                className={
                  held
                    ? "relative rounded-xl bg-dt-ink py-3 text-center text-[13.5px] font-semibold tabular-nums text-dt-on-ink"
                    : taken
                      ? "rounded-xl py-3 text-center text-[13.5px] tabular-nums text-dt-ink-3/60 line-through"
                      : "rounded-xl bg-dt-surface py-3 text-center text-[13.5px] font-medium tabular-nums text-dt-ink-2"
                }
              >
                {t}
                {held && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-dt-surface bg-dt-accent" />}
              </div>
            );
          })}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <AgentCard who="Agent A" via="voice call" call="hold_slot 14:30" ok result="held · expires in 4:59" />
          <AgentCard who="Agent B" via="web chat" call="hold_slot 14:30" result="CONFLICT · offers 15:00, 15:30" />
        </div>
      </div>
    </div>
  );
}

function AgentCard({ who, via, call, result, ok }: { who: string; via: string; call: string; result: string; ok?: boolean }) {
  return (
    <div className="rounded-2xl border border-dt-line p-4">
      <div className="flex items-center justify-between text-[13px]">
        <span className="font-semibold">{who}</span>
        <span className="text-dt-ink-3">{via}</span>
      </div>
      <div className="mt-3 font-mono text-[12.5px] text-dt-ink-2">→ {call}</div>
      <div className={`mt-1 font-mono text-[12.5px] ${ok ? "text-dt-accent-ink" : "text-dt-held-ink"}`}>
        ← {result}
      </div>
    </div>
  );
}

function CodeCard() {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0b0b0f] shadow-dt-float">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="ml-2 font-mono text-[11.5px] text-[#8b8b95]">commit_hold → refused</span>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed text-[#e4e4e7]">
        <code>
          {"{\n"}
          {"  "}<span className="text-[#7dd3fc]">&quot;error&quot;</span>: <span className="text-[#6ee7b7]">&quot;CONFLICT&quot;</span>,{"\n"}
          {"  "}<span className="text-[#7dd3fc]">&quot;booked&quot;</span>: <span className="text-[#c4b5fd]">false</span>, <span className="text-[#7dd3fc]">&quot;reserved&quot;</span>: <span className="text-[#c4b5fd]">false</span>,{"\n"}
          {"  "}<span className="text-[#7dd3fc]">&quot;alternatives&quot;</span>: [{"\n"}
          {"    "}{"{ "}<span className="text-[#7dd3fc]">&quot;start_local&quot;</span>: <span className="text-[#6ee7b7]">&quot;Tue, 3:00 pm&quot;</span>{" },\n"}
          {"    "}{"{ "}<span className="text-[#7dd3fc]">&quot;start_local&quot;</span>: <span className="text-[#6ee7b7]">&quot;Tue, 3:30 pm&quot;</span>{" }\n"}
          {"  ],\n"}
          {"  "}<span className="text-[#7dd3fc]">&quot;next&quot;</span>: <span className="text-[#6ee7b7]">&quot;Offer one, then hold it.&quot;</span>{"\n"}
          {"}"}
        </code>
      </pre>
    </div>
  );
}

function FeaturedCard({ e }: { e: ExampleMeta }) {
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-dt-line bg-dt-surface shadow-dt-surface transition-colors hover:border-dt-line-strong has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-dt-ink">
      {/* The actual example, rendered live and chrome-free; the card's one link opens the full page. */}
      <div className="pointer-events-none relative aspect-[16/10] overflow-hidden border-b border-dt-line bg-dt-canvas">
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
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <a href={e.href} className="text-[15px] font-semibold tracking-tight outline-none after:absolute after:inset-0">
            {e.label}
          </a>
          <div className="mt-0.5 text-[13px] text-dt-ink-3">{e.tagline}</div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-dt-ink-3 transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-dt-ink" />
      </div>
    </div>
  );
}

function RowCard({ e }: { e: ExampleMeta }) {
  const Icon = e.icon;
  return (
    <div className="group relative flex items-center gap-3 rounded-2xl border border-dt-line bg-dt-surface px-4 py-3.5 transition-colors hover:border-dt-line-strong has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-dt-ink">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-dt-sunken text-dt-ink">
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <a href={e.href} className="text-[14px] font-medium outline-none after:absolute after:inset-0">
          {e.label}
        </a>
        <div className="truncate text-[12px] text-dt-ink-3">{e.tagline}</div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-dt-ink-3 transition-colors group-hover:text-dt-ink" />
    </div>
  );
}
