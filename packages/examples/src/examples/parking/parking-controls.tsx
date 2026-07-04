"use client";

import { Input } from "../../components/ui/input";
import { cn } from "@open-deltat/shared/utils";

export const DURATIONS = [
  { label: "1h", minutes: 60 },
  { label: "2h", minutes: 120 },
  { label: "4h", minutes: 240 },
  { label: "8h", minutes: 480 },
  { label: "All day", minutes: 1440 },
];

interface ParkingControlsProps {
  startTime: string;
  onStartTimeChange: (time: string) => void;
  duration: number;
  onDurationChange: (minutes: number) => void;
  summary: string;
}

export function ParkingControls({
  startTime,
  onStartTimeChange,
  duration,
  onDurationChange,
  summary,
}: ParkingControlsProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-zinc-400">
          Arrive
          <Input
            type="time"
            value={startTime}
            onChange={(e) => onStartTimeChange(e.target.value)}
            className="h-8 w-28 border-white/10 bg-white/5 text-sm text-zinc-100"
          />
        </label>
        <div className="flex flex-wrap items-center justify-center gap-1">
          {DURATIONS.map((d) => {
            const active = duration === d.minutes;
            return (
              <button
                key={d.minutes}
                onClick={() => onDurationChange(d.minutes)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  active
                    ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                    : "border-white/10 text-zinc-400 hover:text-zinc-200"
                )}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="text-[11px] text-zinc-500">{summary}</div>
    </div>
  );
}
