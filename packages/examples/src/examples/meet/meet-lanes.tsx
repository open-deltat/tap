"use client";

import { cn } from "@open-deltat/shared/utils";
import type { AvailabilitySlot } from "../../lib/schemas";

export interface MeetLane {
  label: string;
  slots: AvailabilitySlot[];
  /** The "everyone" lane: the only one drawn in colour, because it is the answer. */
  everyone?: boolean;
}

interface MeetLanesProps {
  lanes: MeetLane[];
  /** Shared axis bounds (Unix ms). All lanes are positioned against these. */
  axisStart: number;
  axisEnd: number;
  /** The chosen time, drawn across every lane so the eye sees it fits each calendar. */
  selected?: AvailabilitySlot;
}

const TICK_MS = 2 * 3_600_000;
// Hour only ("7 PM", "19"): the ruler is a guide, the exact time is on the buttons below it.
const hourLabel = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric" });

/**
 * Each person's free time on one shared ruler, with the time everyone shares underneath. Read-only:
 * times are picked with buttons below it, because a tap on a thin bar is a guess on a phone.
 */
export function MeetLanes({ lanes, axisStart, axisEnd, selected }: MeetLanesProps) {
  const range = axisEnd - axisStart;
  const pct = (ms: number) => Math.max(0, Math.min(100, ((ms - axisStart) / range) * 100));
  const ticks = Array.from({ length: Math.floor(range / TICK_MS) + 1 }, (_, i) => axisStart + i * TICK_MS);
  const band = (s: AvailabilitySlot) => ({ left: `${pct(s.start)}%`, width: `${pct(s.end) - pct(s.start)}%` });

  return (
    <div className="select-none">
      <div className="relative ml-[4.5rem] h-4" aria-hidden>
        {ticks.map((t, i) => (
          <span
            key={t}
            className={cn(
              "absolute whitespace-nowrap text-[10px] tabular-nums text-dt-ink-3",
              i === 0 ? "translate-x-0" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2"
            )}
            style={{ left: `${pct(t)}%` }}
          >
            {hourLabel(t)}
          </span>
        ))}
      </div>

      <div className="relative mt-1.5 space-y-1.5">
        {lanes.map((lane) => (
          <div key={lane.label} className={cn("flex items-center gap-2", lane.everyone && "mt-3 border-t border-dt-line pt-3")}>
            <span className={cn("flex w-16 shrink-0 items-center justify-end text-right text-[12px]", lane.everyone ? "font-semibold text-dt-ink" : "text-dt-ink-2")}>
              <span className="truncate">{lane.label}</span>
            </span>
            <div className={cn("relative flex-1 rounded-full bg-dt-line/50", lane.everyone ? "h-3" : "h-2")} aria-hidden>
              {lane.slots.map((s) => (
                <div
                  key={s.start}
                  className={cn("absolute inset-y-0 rounded-full", lane.everyone ? "bg-dt-accent" : "bg-dt-ink-3/45")}
                  style={band(s)}
                />
              ))}
            </div>
          </div>
        ))}

        {selected && (
          <div className="pointer-events-none absolute inset-y-[-4px] left-[4.5rem] right-0" aria-hidden>
            <div
              className="absolute inset-y-0 rounded-md bg-dt-ink/[0.07] ring-1 ring-dt-ink/25 transition-[left,width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
              style={band(selected)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
