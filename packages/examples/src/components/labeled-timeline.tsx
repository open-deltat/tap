import { cn } from "@open-deltat/shared/utils";

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
  /** A math operator shown in a left gutter (e.g. "−", "=") so the rows read like an equation. */
  op?: string;
  /** Draw a separator line above this row, to mark it as the result of the rows above. */
  divider?: boolean;
  /** Render this row as a section title (e.g. a person's name) above the rows that follow it. */
  heading?: string;
  boxes: TimelineBox[];
}

// The keys are the callers' names for meaning, mapped onto the dt-* tokens so a box reads the same in
// light and dark: emerald is free, rose is taken, amber is held, sky is a neutral ink mark.
const COLOR: Record<BoxColor, string> = {
  sky: "border-dt-ink/20 bg-dt-ink/[0.07] text-dt-ink",
  rose: "border-dt-line-strong bg-dt-taken text-dt-ink-3",
  emerald: "border-dt-accent/40 bg-dt-accent-soft text-dt-accent-ink",
  amber: "border-dt-held/50 bg-dt-held-soft text-dt-held-ink",
  zinc: "border-dt-line bg-dt-ink-3/20 text-dt-ink",
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
  /** A top ruler of labelled marks (e.g. hour ticks), positioned on the same scale as the rows. */
  ticks?: { value: number; label: string }[];
}

export function LabeledTimeline({
  axisStart,
  axisEnd,
  rows,
  showAxis = false,
  pastLabel = "past",
  futureLabel = "future",
  labelWidth = 64,
  ticks,
}: Props) {
  const range = axisEnd - axisStart || 1;
  const pct = (ms: number) => ((ms - axisStart) / range) * 100;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const pos = (s: number, e: number) => {
    const left = clamp(pct(s));
    const width = clamp(pct(e)) - left;
    return width > 0 ? { left: `${left}%`, width: `${width}%` } : null;
  };

  const hasOps = rows.some((r) => r.op);

  return (
    // Drawn straight on the surface between hairlines; the examples never put a box inside the card.
    <div className="border-y border-dt-line py-3.5">
      {ticks && ticks.length > 0 && (
        <div className="mb-1.5 flex items-end gap-2">
          {hasOps && <span className="w-3 shrink-0" />}
          {labelWidth > 0 && <span className="shrink-0" style={{ width: labelWidth }} />}
          <div className="relative h-3.5 flex-1">
            {ticks.map((t, i) => {
              const left = clamp(pct(t.value));
              return (
                <span
                  key={i}
                  className="absolute -translate-x-1/2 text-[9px] tabular-nums text-dt-ink-3"
                  style={{ left: `${left}%` }}
                >
                  {t.label}
                </span>
              );
            })}
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        {rows.map((row, ri) => (
          <div key={ri}>
            {row.divider && <div className="mb-1.5 h-px bg-dt-accent/25" />}
            {row.heading ? (
              <div className={cn("pb-0.5 text-[12px] font-semibold text-dt-ink", ri > 0 && "pt-2")}>
                {row.heading}
              </div>
            ) : (
            <div className="flex items-center gap-2">
              {hasOps && (
                <span className="w-3 shrink-0 text-right font-mono text-[11px] text-dt-ink-3">
                  {row.op ?? ""}
                </span>
              )}
              {(row.label || labelWidth > 0) && (
                <span className="shrink-0 text-right text-[10px] font-medium text-dt-ink-3" style={{ width: labelWidth }}>
                  {row.label}
                </span>
              )}
              <div className="relative h-5 flex-1">
                {row.boxes.map((b, bi) => {
                  const p = pos(b.start, b.end);
                  return p ? (
                    <div
                      key={bi}
                      title={b.text}
                      className={cn(
                        "absolute inset-y-0 flex items-center justify-center overflow-hidden rounded-md border text-[10px] font-medium",
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
            )}
          </div>
        ))}
      </div>

      {showAxis && (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-dt-ink-3" style={{ paddingLeft: labelWidth + 8 }}>
          <span>◀ {pastLabel}</span>
          <div className="h-px flex-1 bg-dt-line-strong" />
          <span>{futureLabel} ▶</span>
        </div>
      )}
    </div>
  );
}
