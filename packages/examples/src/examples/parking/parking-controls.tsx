"use client";

import { Input } from "../../components/ui/input";
import { cn } from "@open-deltat/shared/utils";
import { PILL_ACTIVE, PILL_BASE, PILL_IDLE } from "../../lib/accent";

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
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <label className="flex items-center gap-2 text-[13px] text-dt-ink-3">
          Arrive
          <Input
            type="time"
            value={startTime}
            onChange={(e) => onStartTimeChange(e.target.value)}
            className="h-11 w-32 rounded-full border-dt-line-strong bg-dt-surface px-4 tabular-nums text-dt-ink sm:h-9"
          />
        </label>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {DURATIONS.map((d) => {
            const active = duration === d.minutes;
            return (
              <button
                key={d.minutes}
                onClick={() => onDurationChange(d.minutes)}
                aria-pressed={active}
                className={cn(PILL_BASE, active ? PILL_ACTIVE : PILL_IDLE)}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="text-center text-[12px] tabular-nums text-dt-ink-3">{summary}</div>
    </div>
  );
}
