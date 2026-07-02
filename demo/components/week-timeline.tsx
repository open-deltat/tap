"use client";

import { cn } from "@/lib/utils";

// A day-granularity timeline (one cell per day) for spans that run over weeks rather than hours,
// the coarse counterpart to the hour-level LabeledTimeline. Rows share one date axis; cells are
// grouped in sevens so the week structure reads at a glance. Reusable for any per-day availability
// view (five friends' evenings, hotel rooms across nights, etc.).

export type DayState = "free" | "busy";

export interface WeekRow {
  label: string;
  states: DayState[]; // one per day, aligned to the shared axis
  /** A result row (e.g. the intersection); its free cells are the actionable ones. */
  result?: boolean;
}

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

interface Props {
  /** Midnight of the first day. */
  start: Date;
  /** Number of days (columns). Every row's `states` must be this length. */
  dayCount: number;
  rows: WeekRow[];
  /** Click a free cell in a result row (dayIndex). */
  onPick?: (dayIndex: number) => void;
  /** Ring the column of the chosen day. */
  selectedDay?: number;
  labelWidth?: number;
}

export function WeekTimeline({ start, dayCount, rows, onPick, selectedDay, labelWidth = 64 }: Props) {
  const dayDate = (i: number) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  };

  // Render the row of N day-cells with a faint gap before each new week.
  const cells = (states: DayState[], result: boolean) =>
    Array.from({ length: dayCount }, (_, i) => {
      const free = states[i] === "free";
      const actionable = result && free && !!onPick;
      const picked = result && i === selectedDay;
      const cell = (
        <div
          className={cn(
            "h-6 flex-1 rounded-[3px] border transition-colors",
            free
              ? result
                ? "border-emerald-400/50 bg-emerald-500/40"
                : "border-emerald-400/30 bg-emerald-500/20"
              : "border-white/[0.06] bg-white/[0.02]",
            actionable && "cursor-pointer hover:bg-emerald-400/60",
            picked && "ring-2 ring-emerald-300 ring-offset-1 ring-offset-[#0a0a0c]"
          )}
        />
      );
      return (
        <div key={i} className={cn("flex flex-1", i > 0 && i % 7 === 0 && "ml-1.5")}>
          {actionable ? (
            <button type="button" onClick={() => onPick(i)} className="flex flex-1" aria-label={`Book ${dayDate(i).toDateString()}`}>
              {cell}
            </button>
          ) : (
            cell
          )}
        </div>
      );
    });

  return (
    <div className="overflow-x-auto rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="min-w-[28rem] sm:min-w-0">
      {/* date axis */}
      <div className="mb-1.5 flex items-end gap-2">
        <span className="shrink-0" style={{ width: labelWidth }} />
        <div className="flex flex-1">
          {Array.from({ length: dayCount }, (_, i) => {
            const d = dayDate(i);
            return (
              <div key={i} className={cn("flex flex-1 flex-col items-center", i > 0 && i % 7 === 0 && "ml-1.5")}>
                <span className="text-[8px] uppercase text-zinc-600">{WEEKDAY[d.getDay()]}</span>
                <span className="text-[9px] tabular-nums text-zinc-500">{d.getDate()}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        {rows.map((row, ri) => (
          <div key={ri}>
            {row.result && <div className="my-1 h-px bg-emerald-400/20" />}
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "shrink-0 truncate text-right text-[10px]",
                  row.result ? "font-medium text-zinc-300" : "text-zinc-400"
                )}
                style={{ width: labelWidth }}
              >
                {row.label}
              </span>
              <div className="flex flex-1 gap-px">{cells(row.states, !!row.result)}</div>
            </div>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
