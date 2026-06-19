"use client";

import { cn } from "@/lib/utils";
import { HOLDS_STEPS } from "./script";
import { SeatRow } from "./seat-row";
import { HoldsFlow } from "./holds-flow";

const LEGEND: { label: string; cls: string }[] = [
  { label: "free", cls: "border-emerald-400/40 bg-emerald-500/20" },
  { label: "on hold", cls: "border-amber-300/70 bg-amber-400/30" },
  { label: "booked", cls: "border-sky-400/70 bg-sky-500/35" },
  { label: "turned away", cls: "border-red-400/80 bg-red-500/35" },
];

// The whole holds-and-races story laid out as one static picture you read top to bottom. No timer,
// no animation. Each step shows what both people see and a plain sentence about what happened.
export function HoldsStatic() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-[10.5px] uppercase tracking-[0.2em] text-zinc-500">Two people, one seat</div>
      <h2 className="mt-2 text-2xl font-semibold text-zinc-100">Holds and races</h2>
      <p className="mt-1 text-sm text-emerald-300/90">What stops two people grabbing the same seat at the same time.</p>

      <div className="mt-4 flex flex-wrap gap-3 text-[10px] uppercase tracking-wider text-zinc-500">
        {LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className={cn("h-3 w-3 rounded-[4px] border", l.cls)} />
            {l.label}
          </span>
        ))}
      </div>

      <div className="mt-6">
        <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-zinc-500">The lifecycle</div>
        <HoldsFlow />
      </div>

      <div className="mb-2 mt-8 text-[11px] uppercase tracking-[0.18em] text-zinc-500">Step by step</div>
      <ol className="space-y-2.5">
        {HOLDS_STEPS.map((step, i) => (
          <li key={i} className="flex gap-3">
            <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/15 bg-white/[0.03] text-[11px] font-medium text-zinc-300">
              {i + 1}
            </div>
            <div className="flex-1 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="text-[13px] font-medium text-zinc-100">{step.title}</div>
              <div className="mt-2">
                <SeatRow label="Person A" lane={step.a} />
                <div className="my-1.5 h-px bg-white/10" />
                <SeatRow label="Person B" lane={step.b} />
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">{step.caption}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
