"use client";

import type { MouseEvent } from "react";
import { cn } from "@open-deltat/shared/utils";
import { formatTime } from "@open-deltat/shared/time";
import type { AvailabilitySlot } from "../../lib/schemas";

export interface MeetLane {
  label: string;
  slots: AvailabilitySlot[];
  /** emerald intersection lane: shows discrete bookable slots you can click. */
  intersection?: boolean;
}

interface MeetLanesProps {
  lanes: MeetLane[];
  /** Shared axis bounds (Unix ms). All lanes are positioned against these. */
  axisStart: number;
  axisEnd: number;
  tickHours?: number;
  /** Discrete bookable slots in the intersection lane (already duration-length). */
  intersectionSlots?: AvailabilitySlot[];
  /** Selected slot starts (Unix ms). */
  selectedStarts?: Set<number>;
  /** Click the lane → nearest slot. additive = shift/cmd-click (toggle multi-select). */
  onPickSlot?: (slot: AvailabilitySlot, additive: boolean) => void;
}

/**
 * Free-time lanes on ONE shared time ruler. The emerald intersection lane is the clickable graph:
 * click it to snap to the nearest bookable start, shift/cmd-click to select several. Selected slots
 * light up; faint ticks mark every bookable start.
 */
export function MeetLanes({
  lanes,
  axisStart,
  axisEnd,
  tickHours = 1,
  intersectionSlots = [],
  selectedStarts,
  onPickSlot,
}: MeetLanesProps) {
  const range = axisEnd - axisStart;
  const pct = (ms: number) => ((ms - axisStart) / range) * 100;
  const clampPct = (v: number) => Math.max(0, Math.min(100, v));

  const ticks: number[] = [];
  for (let t = axisStart; t <= axisEnd; t += tickHours * 3_600_000) ticks.push(t);

  // One gridline every tick interval, drawn as a single repeating gradient so every line is exactly
  // evenly spaced, per-element 1px dividers drift visibly from sub-pixel rounding.
  const tickPct = ((tickHours * 3_600_000) / range) * 100;
  const gridBg = `repeating-linear-gradient(to right, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 1px, transparent 1px, transparent ${tickPct}%)`;

  const intersectionLabel = lanes.find((l) => l.intersection)?.label ?? "shared";

  function handleLaneClick(e: MouseEvent<HTMLDivElement>) {
    if (!onPickSlot || intersectionSlots.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const t = axisStart + ((e.clientX - rect.left) / rect.width) * range;
    // Snap to the nearest bookable start. Slots are drawn start→end and overlap (30-min steps), so
    // matching by nearest start (not "first span containing t") picks the slot the click is closest
    // to, and any click on the lane selects something (no dead zones near the edges).
    let best = intersectionSlots[0];
    let bestD = Math.abs(best.start - t);
    for (const s of intersectionSlots) {
      const d = Math.abs(s.start - t);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    onPickSlot(best, e.shiftKey || e.metaKey);
  }

  return (
    <div className="select-none">
      {/* shared hour ruler */}
      <div className="relative ml-14 h-5 sm:ml-20">
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute -translate-x-1/2 text-[10px] tabular-nums text-zinc-500"
            style={{ left: `${clampPct(pct(t))}%` }}
          >
            {formatTime(t)}
          </div>
        ))}
      </div>

      <div className="space-y-2.5">
        {lanes.map((lane) => {
          const clickable = !!lane.intersection && !!onPickSlot && intersectionSlots.length > 0;
          return (
            <div key={lane.label} className="flex items-stretch gap-3">
              <div
                className={cn(
                  "w-12 shrink-0 self-center text-right text-xs font-medium sm:w-[68px]",
                  lane.intersection ? "text-emerald-300" : "text-zinc-400"
                )}
              >
                {lane.label}
              </div>

              <div
                className={cn(
                  "relative h-8 flex-1 overflow-hidden rounded-md bg-white/[0.03]",
                  clickable && "cursor-pointer"
                )}
                style={{ backgroundImage: gridBg }}
                onClick={lane.intersection ? handleLaneClick : undefined}
              >
                {/* free windows (faint context) */}
                {lane.slots.map((slot, i) => {
                  const left = clampPct(pct(slot.start));
                  const width = clampPct(pct(slot.end)) - left;
                  if (width <= 0) return null;
                  return (
                    <div
                      key={i}
                      aria-hidden
                      className={cn(
                        "pointer-events-none absolute inset-y-1 rounded",
                        lane.intersection ? "bg-emerald-500/10 ring-1 ring-emerald-400/15" : "bg-zinc-500/25 ring-1 ring-white/10"
                      )}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    />
                  );
                })}

                {/* intersection: bookable-slot ticks + selected highlights */}
                {lane.intersection &&
                  intersectionSlots.map((s) => {
                    const left = clampPct(pct(s.start));
                    const width = clampPct(pct(s.end)) - left;
                    const sel = selectedStarts?.has(s.start);
                    if (sel) {
                      return (
                        <div
                          key={s.start}
                          aria-hidden
                          className="pointer-events-none absolute inset-y-0.5 rounded bg-emerald-400/80 shadow-[0_0_0_2px_rgba(255,255,255,0.55)]"
                          style={{ left: `${left}%`, width: `${Math.max(width, 1)}%` }}
                        />
                      );
                    }
                    return (
                      <div
                        key={s.start}
                        aria-hidden
                        className="pointer-events-none absolute inset-y-[38%] w-px bg-emerald-300/40"
                        style={{ left: `${left}%` }}
                      />
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>

      {onPickSlot && (
        <p className="mt-2 text-center text-[10.5px] text-zinc-500">
          Click the <span className="text-emerald-300">{intersectionLabel}</span> lane to pick a time
        </p>
      )}
    </div>
  );
}
