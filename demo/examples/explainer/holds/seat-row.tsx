"use client";

import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";

export type SeatState = "free" | "hold" | "booked" | "reject";
export const FOCUS_SEAT = 3;

export interface LaneSnapshot {
  seats: SeatState[];
  /** This lane is the actor in this step (subtle highlight on its label). */
  acting?: boolean;
}

const SEAT_STYLE: Record<SeatState, string> = {
  free: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
  hold: "border-amber-300/70 bg-amber-400/25 text-amber-100",
  booked: "border-sky-400/70 bg-sky-500/30 text-sky-100",
  reject: "border-red-400/80 bg-red-500/30 text-red-100",
};

function SeatGlyph({ state }: { state: SeatState }) {
  if (state === "booked") return <Check className="h-3 w-3" strokeWidth={2.5} />;
  if (state === "reject") return <X className="h-3 w-3" strokeWidth={2.5} />;
  return null;
}

export function SeatRow({ label, lane, pulseFocus = false }: { label: string; lane: LaneSnapshot; pulseFocus?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex w-[64px] shrink-0 items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 rounded-full transition-colors", lane.acting ? "bg-emerald-400" : "bg-white/20")} />
        <span className={cn("text-[11px] font-medium", lane.acting ? "text-zinc-100" : "text-zinc-500")}>{label}</span>
      </div>

      <div className="flex flex-1 items-center justify-center gap-1.5">
        {lane.seats.map((state, i) => {
          const isFocus = i === FOCUS_SEAT;
          const animate = pulseFocus && isFocus && (state === "hold" || state === "reject" || state === "booked");
          return (
            <div
              key={i}
              title={`Seat ${i + 1}, ${state}`}
              className={cn(
                "relative flex h-7 w-7 items-center justify-center rounded-md border text-[10px] font-medium tabular-nums",
                SEAT_STYLE[state],
                animate && "ring-2 ring-white/30 ring-offset-1 ring-offset-[#0a0a0c]"
              )}
            >
              <span className="absolute left-0.5 top-0 text-[7px] opacity-60">{i + 1}</span>
              <SeatGlyph state={state} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
