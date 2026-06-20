"use client";

import { formatTime } from "@/lib/time";
import { TimelineTrack, type TimelineBand } from "@/components/timeline-track";

export interface Span {
  start: number;
  end: number;
  label?: string;
}

export interface ResourceLane {
  name: string;
  open: Span[]; // open hours (the bookable window)
  busy: Span[]; // blocking rules + bookings
  free: Span[]; // net availability
}

interface Props {
  resources: ResourceLane[];
  combined: Span[];
  combinedLabel: string;
  selected: { start: number; end: number } | null;
  onPick: (s: Span) => void;
  axisStart: number;
  axisEnd: number;
}

const HOUR = 3_600_000;

export function ScheduleBoard({ resources, combined, combinedLabel, selected, onPick, axisStart, axisEnd }: Props) {
  const range = axisEnd - axisStart;
  const ticks: number[] = [];
  for (let t = axisStart; t <= axisEnd; t += 2 * HOUR) ticks.push(t);

  return (
    <div className="select-none">
      {/* hour ruler, aligned with the tracks */}
      <div className="mb-1 flex gap-3">
        <div className="w-32 shrink-0" />
        <div className="relative h-5 flex-1">
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute -translate-x-1/2 text-[10px] tabular-nums text-zinc-500"
              style={{ left: `${((t - axisStart) / range) * 100}%` }}
            >
              {formatTime(t)}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {resources.map((r) => (
          <div key={r.name} className="flex items-center gap-3">
            <div className="w-32 shrink-0 truncate text-right text-xs font-medium text-zinc-300">{r.name}</div>
            <div className="flex-1">
              <TimelineTrack
                axisStart={axisStart}
                axisEnd={axisEnd}
                height={14}
                gridHours={2}
                ghost={r.open}
                bands={[
                  ...r.free.map((s): TimelineBand => ({ start: s.start, end: s.end, tone: "free" })),
                  ...r.busy.map((s): TimelineBand => ({
                    start: s.start,
                    end: s.end,
                    tone: "busy",
                    label: s.label,
                    title: `${s.label ?? "Busy"} · ${formatTime(s.start)} to ${formatTime(s.end)}`,
                  })),
                ]}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="w-32 shrink-0 text-right text-xs font-semibold text-emerald-300">{combinedLabel}</div>
        <div className="flex-1">
          <TimelineTrack
            axisStart={axisStart}
            axisEnd={axisEnd}
            height={26}
            gridHours={2}
            bands={combined.map((s): TimelineBand => {
              const active = selected != null && selected.start < s.end && selected.end > s.start;
              return {
                start: s.start,
                end: s.end,
                tone: active ? "selected" : "free",
                title: `${formatTime(s.start)} to ${formatTime(s.end)}`,
                onClick: () => onPick(s),
              };
            })}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
        <Legend cls="bg-zinc-500/30" label="availability" />
        <Legend cls="bg-emerald-500/50" label="free" />
        <Legend cls="bg-rose-600/50" label="busy (blocked or booked)" />
        <span>Click a green slot to pick a time.</span>
      </div>
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${cls}`} />
      {label}
    </span>
  );
}
