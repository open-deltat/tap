"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { HOLDS_STEPS, HOLDS_STEP_COUNT } from "./script";
import { HoldsExplainer } from "./holds-explainer";

/**
 * The holds + race story as a self-advancing narrative (not a click-through slideshow): it plays
 * straight through — two clients see the same row, one places a hold, the delta streams to the
 * other, a concurrent grab is rejected, the hold becomes a booking, the TTL expires — then loops.
 * Hover to pause. The caption narrates each beat; the seat rows animate underneath.
 */
export function HoldsNarrative() {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (paused) return;
    timer.current = setTimeout(() => setStep((s) => (s + 1) % HOLDS_STEP_COUNT), 2000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [step, paused]);

  const cur = HOLDS_STEPS[step];

  return (
    <div
      className="mx-auto max-w-2xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.2em] text-zinc-500">
        <span>Hold + race resolution</span>
        <span className="rounded border border-white/10 px-1 py-px font-mono text-[9px] tracking-normal">
          HOLD-01
        </span>
      </div>
      <h2 className="mt-2 text-2xl font-semibold text-zinc-100">Holds &amp; race conditions</h2>
      <p className="mt-1 text-sm text-emerald-300/90">
        Two clients, one contested seat — the engine lets exactly one win.
      </p>

      <div className="mt-5 min-h-[3.25rem]">
        <div className="text-sm font-medium text-zinc-100">{cur.title}</div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-400">{cur.caption}</p>
      </div>

      <div className="mt-4">
        <HoldsExplainer step={step} />
      </div>

      <div className="mt-6 flex gap-1">
        {HOLDS_STEPS.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-0.5 flex-1 rounded-full transition-colors",
              i <= step ? "bg-emerald-400/60" : "bg-white/10"
            )}
          />
        ))}
      </div>
      <p className="mt-2 text-center text-[10.5px] text-zinc-600">plays automatically · hover to pause</p>
    </div>
  );
}
