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
import { RaceModule } from "@/components/landing/race-module";
import { DifferenceModule } from "@/components/landing/difference-module";
import { VerbsBento } from "@/components/landing/verbs-bento";
import { Faq } from "@/components/landing/faq";

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
  // Group bookings has its own section above the gallery, so the gallery does not repeat it.
  const meet = all.find((e) => e.id === "meet");
  const featured = all.filter((e) => e.group === "featured" && e.id !== "meet");
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
              A calendar is a list that gets copied around. Δt is a database of time. Agents query it, hold a slot
              while they decide, and commit in one step. Every screen hears it the moment it is written. Nothing is
              ever booked twice.
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

          <RaceModule />
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

        {/* The difference: why "my calendar already does that" is not true */}
        <Section
          eyebrow="Why not my calendar?"
          title="A calendar is a list. Δt is a database of time."
          lead="Google Calendar, Outlook and every .ics feed hand you a list of events and leave the rest to you. An agent needs an answer, a hold, and a write that fails when it should. Ask both the same four things."
        >
          <DifferenceModule />
        </Section>

        {/* How it works */}
        <Section eyebrow="How it works" title="Four verbs. No race left to lose.">
          <VerbsBento />
          <p className="mt-8 max-w-3xl text-[15px] leading-relaxed text-dt-ink-2">
            Underneath is Δt, a database whose one rule is that two bookings never occupy the same time. The refusal
            comes from the storage engine, not from code that checked first and hoped. It speaks TAP, the Time
            Allocation Protocol, over the Postgres wire, so the Postgres driver you already use connects to it.
          </p>
        </Section>

        {/* The question a calendar cannot answer, asked of the live example */}
        <Section
          eyebrow="Ask time a question"
          title="When are five people free for an hour? One query."
          lead="A calendar can list what is in it. It cannot answer this. Δt computes the gaps across every calendar you name on each read, and holds the answer while you confirm. This is the live example, running on Δt now: pick a length."
        >
          <div className="overflow-hidden rounded-[28px] border border-dt-line bg-dt-canvas shadow-dt-float">
            <iframe src="/embed/meet" title="Group bookings, live" loading="lazy" className="block h-[820px] w-full border-0 sm:h-[860px]" />
          </div>
          {meet && (
            <div className="mt-4 text-center">
              <a href={meet.href} className="inline-flex min-h-11 items-center gap-1.5 text-[14px] font-medium text-dt-ink hover:text-dt-accent-ink">
                Open the full example
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          )}
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
          <div className="grid gap-4 sm:grid-cols-3">
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

        {/* FAQ */}
        <Section eyebrow="Questions" title="The ones people ask with their calendar open in the next tab.">
          <Faq />
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

function Section({ id, eyebrow, title, lead, children }: { id?: string; eyebrow: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-16 px-5 py-16 sm:px-6 sm:py-24">
      <div className="mb-10 max-w-2xl sm:mb-12">
        <div className="text-[13px] font-medium text-dt-accent-ink">{eyebrow}</div>
        <h2 className="mt-2 text-balance text-[1.9rem] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[2.6rem]">{title}</h2>
        {lead && <p className="mt-4 text-pretty text-[16px] leading-relaxed text-dt-ink-2">{lead}</p>}
      </div>
      {children}
    </section>
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
