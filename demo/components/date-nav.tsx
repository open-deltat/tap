"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The shared day stepper for every "find a time" ribbon: ‹ label › with an optional quiet "Today"
// reset. Replaces the per-example chevron+date clusters (meet, restaurant, calendar, rules).
export function DateNav({
  label,
  onPrev,
  onNext,
  onToday,
  showToday,
  className,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday?: () => void;
  /** Show the "Today" reset (e.g. only when not already on today). */
  showToday?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-center gap-1", className)}>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onPrev}
        aria-label="Previous day"
        className="text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[9rem] text-center text-sm font-medium text-zinc-200 tabular-nums sm:min-w-[11rem]">{label}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onNext}
        aria-label="Next day"
        className="text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      {onToday && showToday && (
        <button type="button" onClick={onToday} className="ml-1.5 text-xs text-emerald-300 hover:text-emerald-200">
          Today
        </button>
      )}
    </div>
  );
}
