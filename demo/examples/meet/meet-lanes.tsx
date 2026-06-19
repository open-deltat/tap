"use client";

import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/time";
import type { AvailabilitySlot } from "@/lib/schemas";

export interface MeetLane {
  label: string;
  slots: AvailabilitySlot[];
  /** emerald intersection lane: blocks are clickable and brighter. */
  intersection?: boolean;
}

interface MeetLanesProps {
  lanes: MeetLane[];
  /** Shared axis bounds (Unix ms). All lanes are positioned against these. */
  axisStart: number;
  axisEnd: number;
  /** Hour tick spacing along the shared ruler. */
  tickHours?: number;
  /** Minimum block length (ms) a meeting needs — shorter intersection blocks are dimmed. */
  minDurationMs?: number;
  /** Currently selected meeting window, highlighted across the intersection lane. */
  selected?: { start: number; end: number } | null;
  onPickIntersection?: (slot: AvailabilitySlot) => void;
}

/**
 * Three free-time lanes on ONE shared horizontal time ruler. Because every lane is
 * positioned against the same [axisStart, axisEnd) range, the intersection lane lines
 * up visually under the overlap of the two individual lanes.
 */
export function MeetLanes({
  lanes,
  axisStart,
  axisEnd,
  tickHours = 1,
  minDurationMs = 0,
  selected,
  onPickIntersection,
}: MeetLanesProps) {
  const range = axisEnd - axisStart;
  const pct = (ms: number) => ((ms - axisStart) / range) * 100;
  const clampPct = (v: number) => Math.max(0, Math.min(100, v));

  const ticks: number[] = [];
  for (let t = axisStart; t <= axisEnd; t += tickHours * 3_600_000) ticks.push(t);

  return (
    <div className="select-none">
      {/* shared hour ruler */}
      <div className="relative ml-20 h-5">
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute -translate-x-1/2 text-[10px] tabular-nums text-zinc-500"
            style={{ left: `${pct(t)}%` }}
          >
            {formatTime(t)}
          </div>
        ))}
      </div>

      <div className="space-y-2.5">
        {lanes.map((lane) => (
          <div key={lane.label} className="flex items-stretch gap-3">
            <div
              className={cn(
                "w-[68px] shrink-0 self-center text-right text-xs font-medium",
                lane.intersection ? "text-emerald-300" : "text-zinc-400"
              )}
            >
              {lane.label}
            </div>

            <div className="relative h-9 flex-1 overflow-hidden rounded-md border border-white/10 bg-white/[0.02]">
              {/* faint gridlines aligned to the same ruler */}
              {ticks.map((t) => (
                <div
                  key={t}
                  aria-hidden
                  className="absolute inset-y-0 w-px bg-white/[0.05]"
                  style={{ left: `${pct(t)}%` }}
                />
              ))}

              {lane.slots.map((slot, i) => {
                const left = clampPct(pct(slot.start));
                const width = clampPct(pct(slot.end)) - left;
                if (width <= 0) return null;

                const tooShort = (slot.end - slot.start) < minDurationMs;
                const clickable = !!lane.intersection && !!onPickIntersection && !tooShort;

                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!clickable}
                    onClick={() => clickable && onPickIntersection?.(slot)}
                    title={`${formatTime(slot.start)} – ${formatTime(slot.end)}`}
                    className={cn(
                      "absolute inset-y-1 rounded transition-colors",
                      lane.intersection
                        ? clickable
                          ? "cursor-pointer bg-emerald-500/30 ring-1 ring-emerald-400/50 hover:bg-emerald-500/45"
                          : "bg-emerald-500/10 ring-1 ring-emerald-400/20"
                        : "bg-zinc-500/25 ring-1 ring-white/10"
                    )}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                );
              })}

              {/* selected meeting window overlay on the intersection lane */}
              {lane.intersection && selected && (() => {
                const left = clampPct(pct(selected.start));
                const width = clampPct(pct(selected.end)) - left;
                if (width <= 0) return null;
                return (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 rounded bg-emerald-400/80 shadow-[0_0_0_2px_rgba(255,255,255,0.6)]"
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                );
              })()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
