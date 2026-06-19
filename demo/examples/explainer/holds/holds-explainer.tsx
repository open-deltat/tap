"use client";

import { cn } from "@/lib/utils";
import { HOLDS_STEPS } from "./script";
import { DeltaArrow, SeatRow } from "./seat-row";

interface HoldsExplainerProps {
  step: number;
}

const LEGEND: { label: string; cls: string }[] = [
  { label: "free", cls: "border-emerald-400/40 bg-emerald-500/20" },
  { label: "hold (TTL)", cls: "border-amber-300/70 bg-amber-400/30" },
  { label: "booked", cls: "border-sky-400/70 bg-sky-500/35" },
  { label: "rejected", cls: "border-red-400/80 bg-red-500/35" },
];

const PRINCIPLES: { head: string; body: string }[] = [
  {
    head: "Streaming-first",
    body: "clients receive real-time deltas over LISTEN/NOTIFY — no polling, no stale availability.",
  },
  {
    head: "Holds are temporary",
    body: "a hold is a short-TTL reservation that subtracts from availability the instant it lands.",
  },
  {
    head: "Hold → book is atomic",
    body: "confirming promotes the hold to a booking in one transition; there is no double-claimable window.",
  },
  {
    head: "First-hold-wins",
    body: "concurrent grabs on the same seat are resolved by the engine — the loser is rejected, never double-booked.",
  },
];

export function HoldsExplainer({ step }: HoldsExplainerProps) {
  const current = HOLDS_STEPS[step];

  return (
    <div className="select-none">
      {/* legend */}
      <div className="mb-5 flex flex-wrap items-center justify-center gap-3 text-[10px] uppercase tracking-wider text-zinc-500">
        {LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className={cn("h-3 w-3 rounded-[4px] border", l.cls)} />
            {l.label}
          </span>
        ))}
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-5">
        <SeatRow label="Client A" lane={current.a} pulseFocus />
        <DeltaArrow active={Boolean(current.delta)} />
        <SeatRow label="Client B" lane={current.b} pulseFocus />
      </div>

      {/* principles */}
      <ul className="mt-6 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
        {PRINCIPLES.map((p) => (
          <li key={p.head} className="flex items-start gap-2 text-[12px] leading-relaxed text-zinc-400">
            <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/70" />
            <span>
              <span className="font-medium text-zinc-200">{p.head}</span> — {p.body}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
