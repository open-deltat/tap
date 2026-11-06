import type { ReactNode } from "react";
import { ArrowRight, Check, RefreshCw } from "lucide-react";
import { OLD_WORLD } from "./brand-icons";
import { DeltatMark } from "@/components/deltat-mark";

// The same Tuesday afternoon on two calendars, shown finished. Three agents booked at the same
// moment. On a calendar that is copied and checked now and then, three things go wrong, each marked
// in amber where it happens: the copy was last updated minutes ago, two bookings share one slot, and a slot
// an agent was still asking about was taken under it. On Δt the same three moments end in green:
// live, the second booking refused and moved to a time that still worked, the third held while its
// agent asks. The Δt card wears the logo's own material (dark tile, emerald ring, glow) so old and
// new are told apart before a word is read. Static on purpose, and nothing under it explains it.
// One card, two halves, the arrow on the seam: the same shape as each of the five walls below.
export function WithWithout({ className = "mt-14 sm:mt-20" }: { className?: string }) {
  return (
    <div className={`relative mx-auto grid max-w-5xl overflow-hidden rounded-[32px] border border-dt-line bg-dt-surface shadow-dt-float md:grid-cols-2 ${className}`}>
      <OldCalendar />
      <NewCalendar />
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 z-10 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 rotate-90 place-items-center rounded-full border border-dt-line bg-dt-surface text-dt-ink-2 shadow-dt-surface md:rotate-0"
      >
        <ArrowRight className="h-4 w-4" />
      </span>
    </div>
  );
}

function OldCalendar() {
  return (
    <div className="p-5 sm:p-8">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-dt-ink-2">
        {OLD_WORLD.map(({ name, Mark }) => (
          <span key={name} className="inline-flex items-center gap-1.5">
            <Mark className="h-3.5 w-3.5" />
            {name}
          </span>
        ))}
      </div>
      <Head
        day="Tuesday"
        status={
          <span className="inline-flex items-center gap-1.5 text-dt-held-ink">
            <RefreshCw className="h-3 w-3" />updated 4 min ago
          </span>
        }
      />
      <Rows>
        <Row t="14:30" tag="double booked">
          <OldChip tone="clash">Agent A</OldChip>
          <OldChip tone="clash">Agent B</OldChip>
        </Row>
        <Row t="15:00" tag="no hold">
          <OldChip tone="ghost">Agent C · asking…</OldChip>
          <OldChip tone="clash">Someone else</OldChip>
        </Row>
        <Row t="15:30" />
      </Rows>
    </div>
  );
}

function NewCalendar() {
  return (
    <div className="relative overflow-hidden bg-[#0a0f0d] p-5 text-white sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_112%,rgba(52,211,153,0.38),transparent)]" />
      <div className="relative">
        <div className="mb-4 flex h-[18px] items-center gap-2 text-[12.5px] font-medium text-white/80">
          <DeltatMark size="sm" className="!h-[18px] !w-[18px] !rounded-[5px] !text-[8px]" />
          Δt
        </div>
        <Head
          day="Tuesday"
          status={
            <span className="inline-flex items-center gap-1.5 text-[#6ee7b7]">
              <span className="dt-breathe h-1.5 w-1.5 rounded-full bg-[#34d399]" />
              live
            </span>
          }
          dark
        />
        <Rows dark>
          <Row t="14:30" dark>
            <NewChip tone="booked">Agent A</NewChip>
            <NewChip tone="moved">Agent B → 15:00</NewChip>
          </Row>
          <Row t="15:00" dark>
            <NewChip tone="booked">
              Agent B
              <Check className="ml-1.5 h-3.5 w-3.5 text-[#34d399]" strokeWidth={2.5} />
            </NewChip>
          </Row>
          <Row t="15:30" dark>
            <NewChip tone="booked">Agent C</NewChip>
            <NewChip tone="held">held · 4:59</NewChip>
          </Row>
        </Rows>
      </div>
    </div>
  );
}

function Head({ day, status, dark }: { day: string; status: ReactNode; dark?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 text-[12.5px] ${dark ? "text-white/60" : "text-dt-ink-3"}`}>
      <span className={`font-medium ${dark ? "text-white/80" : "text-dt-ink-2"}`}>{day}</span>
      {status}
    </div>
  );
}

function Rows({ dark, children }: { dark?: boolean; children: ReactNode }) {
  return <div className={`mt-2 divide-y border-y ${dark ? "divide-white/10 border-white/10" : "divide-dt-line border-dt-line"}`}>{children}</div>;
}

function Row({ t, tag, dark, children }: { t: string; tag?: string; dark?: boolean; children?: ReactNode }) {
  return (
    // Fixed row height; the tag wraps under the chips only when a narrow card leaves it no room.
    <div className="flex min-h-[48px] flex-wrap items-center gap-x-3 gap-y-1 py-1.5 sm:min-h-[56px]">
      <span className={`w-11 shrink-0 font-mono text-[12px] tabular-nums ${dark ? "text-white/45" : "text-dt-ink-3"}`}>{t}</span>
      <div className="flex min-w-0 flex-auto gap-1.5">{children}</div>
      {tag && <span className="ml-auto shrink-0 text-[11.5px] font-medium text-dt-held-ink">{tag}</span>}
    </div>
  );
}

// On the old calendar: amber for a booking that collides, dashed grey for an agent still asking.
function OldChip({ tone, children }: { tone: "clash" | "ghost"; children: ReactNode }) {
  const look = tone === "clash" ? "border border-dt-held/40 bg-dt-held-soft text-dt-held-ink" : "border border-dashed border-dt-line-strong text-dt-ink-3";
  return <span className={`inline-flex h-8 flex-1 items-center justify-center whitespace-nowrap rounded-lg px-2 text-[12.5px] font-medium sm:h-9 sm:text-[13.5px] ${look}`}>{children}</span>;
}

// On Δt: white for a booking that stands, dashed for the one that was sent on, green for a hold.
function NewChip({ tone, children }: { tone: "booked" | "moved" | "held"; children: ReactNode }) {
  const look = {
    booked: "flex-1 bg-white text-[#0a0f0d]",
    moved: "flex-1 border border-dashed border-white/30 text-white/60",
    held: "shrink-0 bg-[#34d399]/15 text-[#6ee7b7]",
  }[tone];
  return <span className={`inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg px-2.5 text-[12.5px] font-medium sm:h-9 sm:text-[13.5px] ${look}`}>{children}</span>;
}
