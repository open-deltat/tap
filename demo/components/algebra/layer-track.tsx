"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/time";
import { pctOf, clampPct, type Span, type StepKind } from "@/lib/algebra";
import type { Booking, Hold } from "@/lib/schemas";

interface LayerTrackProps {
  kind: StepKind;
  /** Left gutter label naming the operation, e.g. "open" or "− bookings". */
  rowLabel: string;
  /** Trailing summary, e.g. "09–17" or "10–17". */
  summary?: string;
  /** Spans to draw as solid bands (open/blocking/net). */
  spans?: Span[];
  /** Bookings to draw as punch-out bars (kind === "booking"). */
  bookings?: Booking[];
  /** Live holds to draw as amber bars (kind === "hold"). */
  holds?: Hold[];
  /** Per-booking buffer tail length in ms (dashed hatch). */
  bufferMs?: number;
  /** The open band, drawn faint underneath so punch-outs read as holes. */
  ghostUnder?: Span[];
  axisStart: number;
  axisEnd: number;
  /** Dim the whole row (e.g. net before its reveal step). */
  dim?: boolean;
}

function HoldCountdown({ expiresAt }: { expiresAt: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, expiresAt - Date.now());
  const mm = Math.floor(remaining / 60_000);
  const ss = Math.floor((remaining % 60_000) / 1000);
  return (
    <span className="tabular-nums">
      {mm}:{String(ss).padStart(2, "0")}
    </span>
  );
}

export function LayerTrack({
  kind,
  rowLabel,
  summary,
  spans = [],
  bookings = [],
  holds = [],
  bufferMs = 0,
  ghostUnder = [],
  axisStart,
  axisEnd,
  dim = false,
}: LayerTrackProps) {
  const pct = (ms: number) => pctOf(ms, axisStart, axisEnd);
  const band = (start: number, end: number) => {
    const left = clampPct(pct(start));
    const width = clampPct(pct(end)) - left;
    return width > 0 ? { left: `${left}%`, width: `${width}%` } : null;
  };

  const fill =
    kind === "open"
      ? "bg-zinc-400/15 ring-1 ring-white/10"
      : kind === "blocking"
        ? "bg-red-500/30 ring-1 ring-red-400/30"
        : kind === "booking"
          ? "bg-red-600/45 ring-1 ring-red-400/30"
          : kind === "hold"
            ? "bg-amber-400/55 ring-1 ring-amber-300/70"
            : "bg-emerald-500/45 ring-1 ring-emerald-400/60"; // net

  return (
    <div className={cn("flex items-stretch gap-3 transition-opacity duration-300", dim && "opacity-30")}>
      <div className="w-[68px] shrink-0 self-center text-right text-[11px] font-medium text-zinc-400">
        {rowLabel}
      </div>

      <div className="relative h-7 flex-1 overflow-hidden rounded-md border border-white/10 bg-white/[0.02]">
        {/* the open band as a faint ghost, so subtractions read as holes punched out of it */}
        {ghostUnder.map((g, i) => {
          const pos = band(g.start, g.end);
          return pos ? (
            <div key={`g${i}`} aria-hidden className="absolute inset-y-1 rounded bg-zinc-600/15" style={pos} />
          ) : null;
        })}

        {/* solid bands: open, blocking, net */}
        {spans.map((s, i) => {
          const pos = band(s.start, s.end);
          return pos ? (
            <div
              key={`s${i}`}
              title={`${formatTime(s.start)} – ${formatTime(s.end)}`}
              className={cn("absolute inset-y-1 rounded", fill)}
              style={pos}
            />
          ) : null;
        })}

        {/* booking punch-out bars (+ optional dashed buffer tail) */}
        {bookings.map((b) => {
          const pos = band(b.start, b.end);
          const tail = bufferMs > 0 ? band(b.end, b.end + bufferMs) : null;
          return (
            <span key={b.id}>
              {pos && (
                <div
                  title={`${b.label ?? "booking"} · ${formatTime(b.start)} – ${formatTime(b.end)}`}
                  className={cn("absolute inset-y-1 rounded", fill)}
                  style={pos}
                />
              )}
              {tail && (
                <div
                  aria-hidden
                  className="absolute inset-y-1 rounded bg-red-600/20 [background-image:repeating-linear-gradient(45deg,rgba(255,255,255,0.12)_0,rgba(255,255,255,0.12)_2px,transparent_2px,transparent_5px)]"
                  style={tail}
                />
              )}
            </span>
          );
        })}

        {/* live hold bars with a countdown */}
        {holds.map((h) => {
          const pos = band(h.start, h.end);
          return pos ? (
            <div
              key={h.id}
              className={cn("absolute inset-y-1 flex items-center justify-center rounded text-[9px] text-amber-50", fill)}
              style={pos}
            >
              <HoldCountdown expiresAt={h.expiresAt} />
            </div>
          ) : null;
        })}
      </div>

      <div className="w-[88px] shrink-0 self-center text-left text-[10px] tabular-nums text-zinc-500">
        {summary}
      </div>
    </div>
  );
}
