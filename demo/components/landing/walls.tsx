import type { ReactNode } from "react";
import { ArrowRight, Check, RefreshCw } from "lucide-react";
import { FRIEND_NAMES } from "@open-deltat/examples/lib/friends";
import { DeltatMark } from "@/components/deltat-mark";
import { OLD_WORLD } from "./brand-icons";

// The five things an agent runs into on a normal calendar, each shown twice in the hero's own
// picture language: "Today" on the left with one amber thing wrong, "Δt" on the right ending in
// green. No captions under the pictures: the row's title is the pain, the picture is the proof.
// Every Δt picture shows something the kernel does today.
type Wall = {
  title: string;
  link: { label: string; href: string };
  today: ReactNode;
  deltat: ReactNode;
};

const WALLS: readonly Wall[] = [
  {
    title: "It can’t hold a slot for you while you ask.",
    link: { label: "How holds work", href: "/docs/guides/booking-holds" },
    today: (
      <Rows>
        <Row t="14:30" tag="gone">
          <Chip tone="ghost">Agent A · asking…</Chip>
          <Chip tone="clash">Someone else</Chip>
        </Row>
      </Rows>
    ),
    deltat: (
      <Rows>
        <Row t="14:30">
          <Chip tone="booked">Agent A</Chip>
          <Chip tone="held">held · 4:59</Chip>
        </Row>
      </Rows>
    ),
  },
  {
    title: "It can’t keep every app up to date.",
    link: { label: "How live updates work", href: "/docs/guides/real-time-scheduling" },
    today: (
      <Rows>
        <Line who="Website" status={<Stale when="4 min ago" />} />
        <Line who="Voice agent" status={<Stale when="12 min ago" />} />
        <Line who="Booking app" status={<Stale when="1 hr ago" warn />} />
      </Rows>
    ),
    deltat: (
      <Rows>
        <Line who="Website" status={<Live />} />
        <Line who="Voice agent" status={<Live />} />
        <Line who="Booking app" status={<Live />} />
      </Rows>
    ),
  },
  {
    title: "It can’t tell you when everyone is free.",
    link: { label: "Try it live", href: "#live" },
    today: <Lanes answer={false} />,
    deltat: <Lanes answer />,
  },
  {
    title: "It can’t book several things together.",
    link: { label: "All or nothing, in one step", href: "/docs/guides/capacity" },
    today: <Machines booked={5} failedAt={5} />,
    deltat: <Machines booked={8} />,
  },
  {
    title: "It can’t stop a double booking.",
    link: { label: "How Δt refuses", href: "/docs/guides/prevent-double-booking" },
    today: (
      <Rows>
        <Row t="14:30" tag="double booked">
          <Chip tone="clash">Agent A</Chip>
          <Chip tone="clash">Agent B</Chip>
        </Row>
      </Rows>
    ),
    deltat: (
      <Rows>
        <Row t="14:30">
          <Chip tone="booked">Agent A</Chip>
          <Chip tone="ghost">Agent B → 15:00</Chip>
        </Row>
        <Row t="15:00">
          <Chip tone="booked">
            Agent B
            <Tick />
          </Chip>
        </Row>
      </Rows>
    ),
  },
];

// A zigzag: the line and its picture swap sides on every row, so the eye travels left and right
// down the page instead of only down. Each picture is one card holding "today" and "Δt" with an
// arrow between them: the hero's "from this to this", told again small, five times.
export function Walls() {
  return (
    <ol className="space-y-6 sm:space-y-4">
      {WALLS.map((w, i) => {
        const flip = i % 2 === 1;
        return (
          <li key={w.title} className="grid items-center gap-6 py-6 lg:grid-cols-[1fr_1.35fr] lg:gap-14 lg:py-8">
            <div className={`flex gap-5 ${flip ? "lg:order-2" : ""}`}>
              <span aria-hidden className="font-mono text-[44px] font-semibold leading-none tracking-tighter text-dt-line-strong sm:text-[56px]">
                0{i + 1}
              </span>
              <div className="pt-1 sm:pt-2">
                <h3 className="text-balance text-[22px] font-semibold leading-tight tracking-[-0.02em] sm:text-[26px]">{w.title}</h3>
                <a href={w.link.href} className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-[14px] font-medium text-dt-accent-ink hover:text-dt-ink sm:min-h-0">
                  {w.link.label}
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>
            <BeforeAfter today={w.today} deltat={w.deltat} className={flip ? "lg:order-1" : ""} />
          </li>
        );
      })}
    </ol>
  );
}

// One card, two halves: the old calendar on the left, Δt on the right in the logo's faint emerald,
// a small arrow on the seam. Stacked on a phone, with the arrow pointing down.
function BeforeAfter({ today, deltat, className = "" }: { today: ReactNode; deltat: ReactNode; className?: string }) {
  return (
    <div className={`relative grid overflow-hidden rounded-3xl border border-dt-line bg-dt-surface shadow-dt-surface sm:grid-cols-2 ${className}`}>
      <Half label={<OldWorldMarks />}>{today}</Half>
      <Half label={<DeltatMark size="sm" className="!h-5 !w-5 !rounded-[6px] !text-[9px]" />} good>
        {deltat}
      </Half>
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 rotate-90 place-items-center rounded-full border border-dt-line bg-dt-surface text-dt-ink-2 shadow-dt-surface sm:rotate-0"
      >
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

// The old side is named by the logos people already know, no words: Google Calendar, Apple, Outlook.
function OldWorldMarks() {
  return (
    <span className="flex h-5 items-center gap-2 text-dt-ink-3">
      {OLD_WORLD.map(({ name, Mark }) => (
        <Mark key={name} className="h-4 w-4" />
      ))}
    </span>
  );
}

function Half({ label, good, children }: { label: ReactNode; good?: boolean; children: ReactNode }) {
  return (
    <div
      className={`flex min-h-[170px] flex-col p-5 ${
        good
          ? "border-t border-dt-line bg-[radial-gradient(90%_70%_at_50%_120%,color-mix(in_oklab,var(--dt-accent)_10%,transparent),transparent)] sm:border-l sm:border-t-0"
          : ""
      }`}
    >
      <div className="flex h-5 items-center">{label}</div>
      <div className="mt-3 flex flex-1 flex-col justify-center">{children}</div>
    </div>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-dt-line border-y border-dt-line">{children}</div>;
}

function Row({ t, tag, children }: { t: string; tag?: string; children: ReactNode }) {
  return (
    // The tag wraps under the chips when the pane is too narrow for all three side by side.
    <div className="flex min-h-[46px] flex-wrap items-center gap-x-2.5 gap-y-1 py-1.5">
      <span className="w-10 shrink-0 font-mono text-[11.5px] tabular-nums text-dt-ink-3">{t}</span>
      <div className="flex min-w-0 flex-auto gap-1.5">{children}</div>
      {tag && <span className="ml-auto shrink-0 text-[11px] font-medium text-dt-held-ink">{tag}</span>}
    </div>
  );
}

function Chip({ tone, children }: { tone: "booked" | "clash" | "ghost" | "held"; children: ReactNode }) {
  const look = {
    booked: "flex-1 bg-dt-ink text-dt-on-ink",
    clash: "flex-1 border border-dt-held/40 bg-dt-held-soft text-dt-held-ink",
    ghost: "flex-1 border border-dashed border-dt-line-strong text-dt-ink-3",
    held: "shrink-0 bg-dt-accent-soft text-dt-accent-ink",
  }[tone];
  return <span className={`inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg px-2 text-[12px] font-medium ${look}`}>{children}</span>;
}

function Tick() {
  return <Check className="ml-1.5 h-3.5 w-3.5 text-dt-accent" strokeWidth={2.5} />;
}

function Line({ who, status }: { who: string; status: ReactNode }) {
  return (
    <div className="flex h-[38px] items-center justify-between gap-3 text-[12.5px]">
      <span className="text-dt-ink-2">{who}</span>
      {status}
    </div>
  );
}

function Stale({ when, warn }: { when: string; warn?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[11.5px] tabular-nums ${warn ? "text-dt-held-ink" : "text-dt-ink-3"}`}>
      <RefreshCw className="h-3 w-3" />
      {when}
    </span>
  );
}

function Live() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-dt-accent-ink">
      <span className="dt-breathe h-1.5 w-1.5 rounded-full bg-dt-accent" />
      listening
    </span>
  );
}

// The live example's lanes, small: five people's free evenings as bars, each behind its name, and
// the Everyone lane underneath. With the answer the overlap is drawn in green; without it the lane
// is empty and the work is yours.
const FREE = [
  [10, 90],
  [0, 62],
  [22, 100],
  [22, 100],
  [22, 76],
] as const;

function Lanes({ answer }: { answer: boolean }) {
  return (
    <div className="space-y-1.5">
      {FREE.map(([a, b], i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-12 shrink-0 truncate text-right text-[11px] text-dt-ink-2">{FRIEND_NAMES[i]}</span>
          <div className="relative h-2 flex-1 rounded-full bg-dt-line/50">
            <div className="absolute inset-y-0 rounded-full bg-dt-ink-3/45" style={{ left: `${a}%`, width: `${b - a}%` }} />
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2 border-t border-dt-line pt-2">
        <span className="w-12 shrink-0 text-right text-[11px] font-semibold text-dt-ink">Everyone</span>
        {answer ? (
          <div className="relative h-3 flex-1 rounded-full bg-dt-line/50">
            <div className="absolute inset-y-0 rounded-full bg-dt-accent" style={{ left: "22%", width: "40%" }} />
          </div>
        ) : (
          <>
            <div className="h-3 flex-1 rounded-full border border-dashed border-dt-line-strong" />
            <span className="shrink-0 text-[11px] font-medium text-dt-held-ink">you work it out</span>
          </>
        )}
      </div>
    </div>
  );
}

// Eight machines for one run. Today: booked one by one, the sixth refused, five left hanging.
// Δt: all eight in one step, or none at all.
function Machines({ booked, failedAt }: { booked: number; failedAt?: number }) {
  const all = booked === 8;
  return (
    <div>
      <div className="grid grid-cols-8 gap-1.5">
        {Array.from({ length: 8 }, (_, i) => {
          const look =
            i < booked
              ? "bg-dt-ink"
              : i === failedAt
                ? "border border-dt-held/40 bg-dt-held-soft"
                : "border border-dashed border-dt-line-strong";
          return <div key={i} className={`aspect-square rounded-md ${look}`} />;
        })}
      </div>
      <div className={`mt-3 flex items-center gap-1.5 text-[12px] font-medium ${all ? "text-dt-accent-ink" : "text-dt-held-ink"}`}>
        {all && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
        {all ? "all 8 machines, or none" : "5 of 8 machines, then stuck"}
      </div>
    </div>
  );
}
