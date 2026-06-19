"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEP_CAPTIONS, STEP_COUNT } from "../algebra";

interface StepScrubberProps {
  step: number;
  playing: boolean;
  onStep: (n: number) => void;
  onPlayToggle: () => void;
}

export function StepScrubber({ step, playing, onStep, onPlayToggle }: StepScrubberProps) {
  // Auto-advance while playing, stop at the final step.
  useEffect(() => {
    if (!playing) return;
    if (step >= STEP_COUNT - 1) {
      onPlayToggle();
      return;
    }
    const id = setTimeout(() => onStep(step + 1), 1300);
    return () => clearTimeout(id);
  }, [playing, step, onStep, onPlayToggle]);

  const caption = STEP_CAPTIONS[step];

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
          onClick={() => onStep(Math.min(STEP_COUNT - 1, step + 1))}
          disabled={step >= STEP_COUNT - 1}
          className="rounded-md border border-white/10 p-1 text-zinc-300 transition-colors hover:text-zinc-100 disabled:opacity-30"
          aria-label="Next step"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-1.5">
          {STEP_CAPTIONS.map((_, i) => (
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
          Step {step + 1}/{STEP_COUNT} · {caption.title}
        </div>
      </div>

      <p className="font-mono text-[11px] leading-relaxed text-zinc-400">{caption.caption}</p>
    </div>
  );
}
