import { cn } from "@/lib/utils";

// The richer "Why deltat" look, made reusable: rows of labeled, coloured boxes on a shared time
// axis, with text inside each box and optional past/future arrows. For diagrams where you want a
// few clearly-named segments (not many thin bands).

export type BoxColor = "sky" | "rose" | "emerald" | "amber" | "zinc";

export interface TimelineBox {
  start: number;
  end: number;
  color: BoxColor;
  text?: string;
}

export interface TimelineRow {
  label?: string;
  boxes: TimelineBox[];
}

const COLOR: Record<BoxColor, string> = {
  sky: "border-sky-400/40 bg-sky-500/30 text-sky-50",
  rose: "border-rose-400/40 bg-rose-500/30 text-rose-50",
  emerald: "border-emerald-400/40 bg-emerald-500/30 text-emerald-50",
  amber: "border-amber-300/50 bg-amber-400/30 text-amber-50",
  zinc: "border-white/15 bg-zinc-500/25 text-zinc-100",
};

interface Props {
  axisStart: number;
  axisEnd: number;
  rows: TimelineRow[];
  /** Show a past / future time axis beneath the rows. */
  showAxis?: boolean;
  pastLabel?: string;
  futureLabel?: string;
  /** Left label column width in px. */
  labelWidth?: number;
}

export function LabeledTimeline({
  axisStart,
  axisEnd,
  rows,
  showAxis = false,
  pastLabel = "past",
  futureLabel = "future",
  labelWidth = 64,
}: Props) {
  const range = axisEnd - axisStart || 1;
  const pct = (ms: number) => ((ms - axisStart) / range) * 100;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const pos = (s: number, e: number) => {
    const left = clamp(pct(s));
    const width = clamp(pct(e)) - left;
    return width > 0 ? { left: `${left}%`, width: `${width}%` } : null;
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="space-y-1.5">
        {rows.map((row, ri) => (
          <div key={ri} className="flex items-center gap-2">
            {(row.label || labelWidth > 0) && (
              <span className="shrink-0 text-right text-[10px] text-zinc-400" style={{ width: labelWidth }}>
                {row.label}
              </span>
            )}
            <div className="relative h-6 flex-1">
              {row.boxes.map((b, bi) => {
                const p = pos(b.start, b.end);
                return p ? (
                  <div
                    key={bi}
                    title={b.text}
                    className={cn(
                      "absolute inset-y-0 flex items-center justify-center overflow-hidden rounded-md border text-[9px] font-medium",
                      COLOR[b.color]
                    )}
                    style={p}
                  >
                    <span className="truncate px-1">{b.text}</span>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        ))}
      </div>

      {showAxis && (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-500" style={{ paddingLeft: labelWidth + 8 }}>
          <span>◀ {pastLabel}</span>
          <div className="h-px flex-1 bg-white/15" />
          <span>{futureLabel} ▶</span>
        </div>
      )}
    </div>
  );
}
