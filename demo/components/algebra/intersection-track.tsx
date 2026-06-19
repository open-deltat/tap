"use client";

import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/time";
import { pctOf, clampPct } from "@/lib/algebra";
import type { AvailabilitySlot } from "@/lib/schemas";

interface IntersectionTrackProps {
  combined: AvailabilitySlot[];
  /** The visitor's live hold, overlaid amber on top of the green segment. */
  myHold: { start: number; end: number } | null;
  minDurationMs: number;
  axisStart: number;
  axisEnd: number;
  /** Snap-and-place a hold at the leading window of the clicked free block. */
  onPick: (slot: AvailabilitySlot) => void;
}

export function IntersectionTrack({
  combined,
  myHold,
  minDurationMs,
  axisStart,
  axisEnd,
  onPick,
}: IntersectionTrackProps) {
  const pct = (ms: number) => pctOf(ms, axisStart, axisEnd);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-300">
        Both free
        <span className="ml-1 font-mono text-[10px] font-normal normal-case tracking-normal text-emerald-300/60">
          min_available = 2
        </span>
      </div>

      <div className="flex items-stretch gap-3">
        <div className="w-[68px] shrink-0 self-center text-right text-[11px] font-medium text-emerald-300/80">
          ∩
        </div>

        <div className="relative h-9 flex-1 overflow-hidden rounded-md border border-emerald-400/20 bg-white/[0.02]">
          {combined.length === 0 && (
            <div className="flex h-full items-center justify-center text-[11px] text-zinc-500">
              No shared free time on this day.
            </div>
          )}

          {combined.map((slot, i) => {
            const left = clampPct(pct(slot.start));
            const width = clampPct(pct(slot.end)) - left;
            if (width <= 0) return null;
            const tooShort = slot.end - slot.start < minDurationMs;
            return (
              <button
                key={i}
                type="button"
                disabled={tooShort}
                onClick={() => !tooShort && onPick(slot)}
                title={`${formatTime(slot.start)} – ${formatTime(slot.end)}`}
                className={cn(
                  "absolute inset-y-1 rounded transition-colors",
                  tooShort
                    ? "bg-emerald-500/10 ring-1 ring-emerald-400/20"
                    : "cursor-pointer bg-emerald-500/30 ring-1 ring-emerald-400/50 hover:bg-emerald-500/45"
                )}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            );
          })}

          {/* the visitor's live hold, amber, on top of the green */}
          {myHold && (() => {
            const left = clampPct(pct(myHold.start));
            const width = clampPct(pct(myHold.end)) - left;
            if (width <= 0) return null;
            return (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-1 rounded bg-amber-400/70 ring-1 ring-amber-200/80"
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            );
          })()}
        </div>

        <div className="w-[88px] shrink-0 self-center text-left text-[10px] tabular-nums text-emerald-300/70">
          {combined.length > 0 ? `${formatTime(combined[0].start)}–${formatTime(combined[combined.length - 1].end)}` : ""}
        </div>
      </div>
    </div>
  );
}
