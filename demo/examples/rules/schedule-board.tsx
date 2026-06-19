"use client";

import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/time";

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
  const pct = (ms: number) => ((ms - axisStart) / range) * 100;
  const clampPct = (v: number) => Math.max(0, Math.min(100, v));
  const band = (s: number, e: number) => {
    const left = clampPct(pct(s));
    const width = clampPct(pct(e)) - left;
    return width > 0 ? { left: `${left}%`, width: `${width}%` } : null;
  };
  const ticks: number[] = [];
  for (let t = axisStart; t <= axisEnd; t += 2 * HOUR) ticks.push(t);

  const gridlines = () =>
    ticks.map((t) => (
      <div key={t} aria-hidden className="absolute inset-y-0 w-px bg-white/[0.05]" style={{ left: `${pct(t)}%` }} />
    ));

  return (
    <div className="select-none">
      <div className="relative mb-1 ml-32 h-5">
        {ticks.map((t) => (
          <div key={t} className="absolute -translate-x-1/2 text-[10px] tabular-nums text-zinc-500" style={{ left: `${pct(t)}%` }}>
            {formatTime(t)}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {resources.map((r) => (
          <div key={r.name} className="flex items-center gap-3">
            <div className="w-32 shrink-0 truncate text-right text-xs font-medium text-zinc-300">{r.name}</div>
            <div className="relative h-7 flex-1 overflow-hidden rounded-md border border-white/10 bg-white/[0.02]">
              {gridlines()}
              {r.open.map((s, i) => {
                const p = band(s.start, s.end);
                return p ? <div key={`o${i}`} aria-hidden className="absolute inset-y-1 rounded bg-zinc-500/15" style={p} /> : null;
              })}
              {r.free.map((s, i) => {
                const p = band(s.start, s.end);
                return p ? (
                  <div key={`f${i}`} className="absolute inset-y-1 rounded bg-emerald-500/40 ring-1 ring-emerald-400/40" style={p} />
                ) : null;
              })}
              {r.busy.map((s, i) => {
                const p = band(s.start, s.end);
                return p ? (
                  <div
                    key={`b${i}`}
                    title={`${s.label ?? "Busy"} · ${formatTime(s.start)} to ${formatTime(s.end)}`}
                    className="absolute inset-y-1 flex items-center justify-center overflow-hidden rounded bg-rose-600/45 px-1 text-[8px] text-rose-50 ring-1 ring-rose-400/30"
                    style={p}
                  >
                    <span className="truncate">{s.label}</span>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="w-32 shrink-0 text-right text-xs font-semibold text-emerald-300">{combinedLabel}</div>
        <div className="relative h-7 flex-1 overflow-hidden rounded-md border border-emerald-400/25 bg-emerald-400/[0.03]">
          {gridlines()}
          {combined.map((s, i) => {
            const p = band(s.start, s.end);
            const active = selected != null && selected.start < s.end && selected.end > s.start;
            return p ? (
              <button
                key={i}
                type="button"
                onClick={() => onPick(s)}
                title={`${formatTime(s.start)} to ${formatTime(s.end)}`}
                className={cn(
                  "absolute inset-y-1 rounded transition-colors",
                  active ? "bg-emerald-400/80 ring-2 ring-white/60" : "bg-emerald-500/45 ring-1 ring-emerald-400/50 hover:bg-emerald-500/65"
                )}
                style={p}
              />
            ) : null;
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
        <Legend cls="bg-zinc-500/30" label="open hours" />
        <Legend cls="bg-emerald-500/50" label="free" />
        <Legend cls="bg-rose-600/50" label="busy (closed or booked)" />
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
