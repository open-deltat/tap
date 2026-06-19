"use client";

import { cn } from "@/lib/utils";
import { Check, X, Zap } from "lucide-react";
import { FOCUS_SEAT, type LaneSnapshot, type SeatState } from "./script";

interface SeatRowProps {
  label: string;
  lane: LaneSnapshot;
  /** Pulse the focus seat (used on the acting lane to draw the eye). */
  pulseFocus?: boolean;
}

const SEAT_STYLE: Record<SeatState, string> = {
  free: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
  hold: "border-amber-300/70 bg-amber-400/25 text-amber-100",
  booked: "border-sky-400/70 bg-sky-500/30 text-sky-100",
  reject: "border-red-400/80 bg-red-500/30 text-red-100",
};

function SeatGlyph({ state }: { state: SeatState }) {
  if (state === "booked") return <Check className="h-3.5 w-3.5" strokeWidth={2.5} />;
  if (state === "reject") return <X className="h-3.5 w-3.5" strokeWidth={2.5} />;
  return null;
}

export function SeatRow({ label, lane, pulseFocus = false }: SeatRowProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex w-[88px] shrink-0 items-center gap-2">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full transition-colors",
            lane.acting ? "bg-emerald-400" : "bg-white/20"
          )}
        />
        <span
          className={cn(
            "text-[11px] font-medium transition-colors",
            lane.acting ? "text-zinc-100" : "text-zinc-500"
          )}
        >
          {label}
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center gap-2">
        {lane.seats.map((state, i) => {
          const isFocus = i === FOCUS_SEAT;
          const animate = pulseFocus && isFocus && (state === "hold" || state === "reject");
          return (
            <div
              key={i}
              title={`Seat ${i + 1} · ${state}`}
              className={cn(
                "relative flex h-9 w-9 items-center justify-center rounded-lg border text-[10px] font-medium tabular-nums transition-all duration-300",
                SEAT_STYLE[state],
                state === "reject" && "animate-pulse",
                animate && "ring-2 ring-offset-2 ring-offset-[#0a0a0c]",
                animate && state === "hold" && "ring-amber-300/60",
                animate && state === "reject" && "ring-red-400/60"
              )}
            >
              <span className="absolute left-1 top-0.5 text-[8px] opacity-60">{i + 1}</span>
              <SeatGlyph state={state} />
            </div>
          );
        })}
      </div>

      <div className="w-[24px] shrink-0" />
    </div>
  );
}

/** The ⚡ delta marker that sits between the two lanes when a change streams A → B. */
export function DeltaArrow({ active }: { active: boolean }) {
  return (
    <div className="flex items-center justify-center gap-2 py-1">
      <div className="w-[88px] shrink-0" />
      <div
        className={cn(
          "flex flex-1 items-center justify-center gap-1.5 text-[10px] font-medium uppercase tracking-wider transition-opacity duration-300",
          active ? "text-emerald-300 opacity-100" : "text-zinc-600 opacity-0"
        )}
      >
        <Zap className="h-3 w-3 fill-emerald-400/40" />
        <span>delta · LISTEN/NOTIFY</span>
        <span aria-hidden className="text-emerald-400/70">↓</span>
      </div>
      <div className="w-[24px] shrink-0" />
    </div>
  );
}
