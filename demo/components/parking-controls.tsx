"use client";

import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/time";

const DURATIONS = [
  { label: "1h", minutes: 60 },
  { label: "2h", minutes: 120 },
  { label: "4h", minutes: 240 },
  { label: "8h", minutes: 480 },
  { label: "All Day", minutes: 1440 },
];

interface ParkingControlsProps {
  selectedSpotName: string | null;
  duration: number;
  onDurationChange: (minutes: number) => void;
  startTime: string;
  onStartTimeChange: (time: string) => void;
  connected: boolean;
  confirmed: boolean;
  isPending: boolean;
  onConfirm: () => void;
  onNewBooking: () => void;
  holdStart: number | null;
  holdEnd: number | null;
}

export function ParkingControls({
  selectedSpotName,
  duration,
  onDurationChange,
  startTime,
  onStartTimeChange,
  connected,
  confirmed,
  isPending,
  onConfirm,
  onNewBooking,
  holdStart,
  holdEnd,
}: ParkingControlsProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs font-medium">Duration</Label>
        <div className="flex gap-1">
          {DURATIONS.map((d) => (
            <button
              key={d.minutes}
              onClick={() => onDurationChange(d.minutes)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                duration === d.minutes
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Start Time</Label>
        <Input type="time" value={startTime} onChange={(e) => onStartTimeChange(e.target.value)} className="text-sm" />
      </div>

      {selectedSpotName && !confirmed && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="text-sm font-medium">Spot {selectedSpotName}</div>
          {holdStart && holdEnd && (
            <div className="text-xs text-muted-foreground">
              {formatTime(holdStart)} – {formatTime(holdEnd)}
            </div>
          )}
          {connected && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600">
              <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              Spot held for you (5 min)
            </div>
          )}
          <Button onClick={onConfirm} disabled={isPending || !connected} className="w-full" size="sm">
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Confirm Parking
          </Button>
        </div>
      )}

      {confirmed && (
        <div className="space-y-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center shrink-0">
              <Check className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <div className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Parked!</div>
              <div className="text-xs text-emerald-600 dark:text-emerald-400">
                Spot {selectedSpotName}
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={onNewBooking}>
            New Booking
          </Button>
        </div>
      )}
    </div>
  );
}
