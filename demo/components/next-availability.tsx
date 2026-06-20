"use client";

import { useEffect, useState } from "react";
import { Loader2, CalendarClock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ACCENT_GHOST } from "@/lib/accent";
import { findNextAvailable, type NextOpening } from "@/lib/first-available";
import { formatTime } from "@/lib/time";

function dayLabel(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

// The shared empty-state for any "find a time" demo. It sits as a semi-transparent overlay ON TOP of
// the still-rendered empty day (the blank timeline shows through), and surfaces the soonest opening as
// an explicit, labelled button — never a silent date jump, so it's always clear the opening is a
// different day, not today. The parent must be position:relative.
export function NextAvailability({
  resourceIds,
  from,
  title,
  minAvailable,
  minDurationMs,
  horizonDays = 60,
  showTime = true,
  onJump,
}: {
  resourceIds: string[];
  /** The day currently in view (empty). The search starts here and lands on the next opening. */
  from: Date;
  /** Why there is nothing to show, e.g. "No shared time today." */
  title: string;
  minAvailable?: number;
  minDurationMs?: number;
  horizonDays?: number;
  showTime?: boolean;
  onJump: (opening: NextOpening) => void;
}) {
  const [state, setState] = useState<{ loading: boolean; next: NextOpening | null }>({ loading: true, next: null });

  const key = `${resourceIds.join(",")}:${new Date(from).setHours(0, 0, 0, 0)}:${minAvailable ?? ""}:${minDurationMs ?? ""}:${horizonDays}`;
  useEffect(() => {
    let alive = true;
    setState({ loading: true, next: null });
    findNextAvailable(resourceIds, from, { minAvailable, minDurationMs, horizonDays })
      .then((next) => alive && setState({ loading: false, next }))
      .catch(() => alive && setState({ loading: false, next: null }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#0a0a0c]/35 px-6 text-center backdrop-blur-[2px]">
      <div className="text-sm font-medium text-zinc-300">{title}</div>

      <div role="status" aria-live="polite">
        {state.loading ? (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> Finding the next opening…
          </div>
        ) : state.next ? (
          <Button
            onClick={() => state.next && onJump(state.next)}
            className={cn("h-9 gap-1.5 rounded-full px-4 text-[13px] font-medium", ACCENT_GHOST)}
          >
            <CalendarClock aria-hidden className="h-3.5 w-3.5" />
            Next opening
            <span className="font-normal text-emerald-300/70">
              · {dayLabel(state.next.start)}
              {showTime ? `, ${formatTime(state.next.start)}` : ""}
            </span>
            <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <div className="text-xs text-zinc-500">Nothing open in the next {horizonDays} days.</div>
        )}
      </div>
    </div>
  );
}
