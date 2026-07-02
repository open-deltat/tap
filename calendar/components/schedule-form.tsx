"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSchedule } from "@/app/actions/setup";
import type { DayName } from "@open-deltat/client";

const DAYS: { label: string; value: DayName }[] = [
  { label: "Sun", value: "sun" },
  { label: "Mon", value: "mon" },
  { label: "Tue", value: "tue" },
  { label: "Wed", value: "wed" },
  { label: "Thu", value: "thu" },
  { label: "Fri", value: "fri" },
  { label: "Sat", value: "sat" },
];

export function ScheduleForm() {
  const [isPending, startTransition] = useTransition();
  const [selectedDays, setSelectedDays] = useState<DayName[]>(["mon", "tue", "wed", "thu", "fri"]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");

  function toggleDay(day: DayName) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function handleApply() {
    if (selectedDays.length === 0) return;

    startTransition(async () => {
      try {
        await saveSchedule({ days: selectedDays, startTime, endTime });
        toast.success("Schedule saved");
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to save schedule");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-medium mb-3">Working Days</h3>
        <div className="flex gap-1">
          {DAYS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => toggleDay(value)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                selectedDays.includes(value)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Start Time</Label>
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">End Time</Label>
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="text-sm" />
        </div>
      </div>

      <Button onClick={handleApply} disabled={isPending || selectedDays.length === 0} className="w-full" size="sm">
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
        Save Schedule
      </Button>
    </div>
  );
}
