"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { HOLDS_STEPS, HOLDS_STEP_COUNT } from "./script";

interface HoldsScrubberProps {
  step: number;
  playing: boolean;
  onStep: (n: number) => void;
  onPlayToggle: () => void;
}

export function HoldsScrubber({ step, playing, onStep, onPlayToggle }: HoldsScrubberProps) {
  // Auto-advance while playing; loop back to the start after the final step so the
  // race story replays cleanly.
  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => {
      onStep(step >= HOLDS_STEP_COUNT - 1 ? 0 : step + 1);
    }, 1600);
    return () => clearTimeout(id);
  }, [playing, step, onStep]);

  const current = HOLDS_STEPS[step];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className="rounded-md border border-white/10 p-1 text-zinc-300 transition-colors hover:text-zinc-100 disabled:opacity-30"
          aria-label="Previous step"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onPlayToggle}
          className="rounded-md border border-emerald-400/30 bg-emerald-400/10 p-1 text-emerald-200 transition-colors hover:bg-emerald-400/20"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={() => onStep(Math.min(HOLDS_STEP_COUNT - 1, step + 1))}
          disabled={step >= HOLDS_STEP_COUNT - 1}
          className="rounded-md border border-white/10 p-1 text-zinc-300 transition-colors hover:text-zinc-100 disabled:opacity-30"
          aria-label="Next step"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-1.5">
          {HOLDS_STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onStep(i)}
              aria-label={`Step ${i + 1}`}
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                i === step ? "bg-emerald-400" : i < step ? "bg-emerald-400/40" : "bg-white/15 hover:bg-white/30"
              )}
            />
          ))}
        </div>

        <div className="ml-1 text-xs font-medium text-zinc-200">
          Step {step + 1}/{HOLDS_STEP_COUNT} · {current.title}
        </div>
      </div>

      <p className="font-mono text-[11px] leading-relaxed text-zinc-400">{current.caption}</p>
    </div>
  );
}
