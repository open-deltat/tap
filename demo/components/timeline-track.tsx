import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// One generic horizontal timeline track, used anywhere we draw time bands (rules, schedules, the
// how-it-works diagrams). Minimalist: no border, a faint background, rounded bands whose corner
// radius scales with the track height, so a thin display track and a thick clickable track look
// like the same component at different sizes.

export type Tone = "open" | "free" | "busy" | "hold" | "selected" | "neutral";

export interface TimelineBand {
  start: number;
  end: number;
  tone: Tone;
  label?: string;
  title?: string;
  onClick?: () => void;
}

interface TimelineTrackProps {
  axisStart: number;
  axisEnd: number;
  bands: TimelineBand[];
  /** Faint bands drawn underneath (e.g. open hours), so the rest read as filled-in. */
  ghost?: { start: number; end: number }[];
  /** Track height in px. Thin (10-14) for display, thicker (24-32) when bands are clickable. */
  height?: number;
  /** Hour spacing for faint gridlines; omit for none. */
  gridHours?: number;
  className?: string;
}

const TONE: Record<Tone, string> = {
  open: "bg-zinc-500/15",
  free: "bg-emerald-500/45 ring-1 ring-emerald-400/40",
  busy: "bg-rose-600/45 ring-1 ring-rose-400/30",
  hold: "bg-amber-400/55 ring-1 ring-amber-300/60",
  selected: "bg-emerald-400/85 ring-2 ring-white/60",
  neutral: "bg-zinc-400/30 ring-1 ring-white/10",
};

export function TimelineTrack({
  axisStart,
  axisEnd,
  bands,
  ghost = [],
  height = 12,
  gridHours,
  className,
}: TimelineTrackProps) {
  const range = axisEnd - axisStart || 1;
  const pct = (ms: number) => ((ms - axisStart) / range) * 100;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const pos = (s: number, e: number): CSSProperties | null => {
    const left = clamp(pct(s));
    const width = clamp(pct(e)) - left;
    return width > 0 ? { left: `${left}%`, width: `${width}%` } : null;
  };

  const radius = Math.min(height / 2, 8); // corner radius scales with thinness
  const inset = Math.max(1, Math.round(height * 0.12));
  const bandStyle = (p: CSSProperties): CSSProperties => ({ ...p, top: inset, bottom: inset, borderRadius: radius * 0.7 });

  const ticks: number[] = [];
  if (gridHours) for (let t = axisStart; t <= axisEnd; t += gridHours * 3_600_000) ticks.push(t);

  return (
    <div
      className={cn("relative w-full overflow-hidden bg-white/[0.03]", className)}
      style={{ height, borderRadius: radius }}
    >
      {ticks.map((t) => (
        <div key={t} aria-hidden className="absolute inset-y-0 w-px bg-white/[0.05]" style={{ left: `${pct(t)}%` }} />
      ))}
      {ghost.map((g, i) => {
        const p = pos(g.start, g.end);
        return p ? <div key={`g${i}`} aria-hidden className="absolute bg-zinc-500/12" style={bandStyle(p)} /> : null;
      })}
      {bands.map((b, i) => {
        const p = pos(b.start, b.end);
        if (!p) return null;
        const inner = cn("absolute flex items-center justify-center overflow-hidden", TONE[b.tone]);
        if (b.onClick) {
          return (
            <button key={i} type="button" onClick={b.onClick} title={b.title} className={cn(inner, "transition-[filter] hover:brightness-125")} style={bandStyle(p)}>
              {b.label && <span className="truncate px-1 text-[8px] leading-none text-white/85">{b.label}</span>}
            </button>
          );
        }
        return (
          <div key={i} title={b.title} className={inner} style={bandStyle(p)}>
            {b.label && <span className="truncate px-1 text-[8px] leading-none text-white/85">{b.label}</span>}
          </div>
        );
      })}
    </div>
  );
}
