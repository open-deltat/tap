"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { addRecurringRules, addRule } from "@/app/actions/rules";
import { toLocalDateString } from "@/lib/time";
import { formatError } from "@/lib/format-error";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface OwnerPanelProps {
  resourceId: string;
  blockedDates: string[];
  onBlockedDatesChange: (dates: string[]) => void;
}

export function AvailabilityOwnerPanel({ resourceId, blockedDates, onBlockedDatesChange }: OwnerPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [fromDate, setFromDate] = useState(toLocalDateString(new Date()));
  const [toDate, setToDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return toLocalDateString(d);
  });
  const [blockDate, setBlockDate] = useState("");

  function toggleDay(day: number) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function handleAddBlockedDate() {
    if (!blockDate || blockedDates.includes(blockDate)) return;
    const startMs = new Date(blockDate + "T00:00:00").getTime();
    const endMs = startMs + 86_400_000;

    startTransition(async () => {
      try {
        await addRule({
          resourceId,
          start: startMs,
          end: endMs,
          blocking: true,
        });
        onBlockedDatesChange([...blockedDates, blockDate]);
        setBlockDate("");
        toast.success(`Blocked ${blockDate}`);
      } catch (err: any) {
        toast.error(formatError(err.message));
      }
    });
  }

  function handleApplySchedule() {
    if (selectedDays.length === 0) return;

    startTransition(async () => {
      try {
        const rules = await addRecurringRules({
          resourceId,
          daysOfWeek: selectedDays,
          startTime,
          endTime,
          fromDate,
          toDate,
          blocking: false,
        });
        toast.success(`Created ${rules.length} availability rules`);
      } catch (err: any) {
        toast.error(formatError(err.message));
      }
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-medium mb-3">Working Days</h3>
        <div className="flex gap-1">
          {DAYS.map((label, i) => (
            <button
              key={i}
              onClick={() => toggleDay(i)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                selectedDays.includes(i)
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

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">From</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">To</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="text-sm" />
        </div>
      </div>

      <Button onClick={handleApplySchedule} disabled={isPending || selectedDays.length === 0} className="w-full" size="sm">
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
        Apply Schedule
      </Button>

      <div className="border-t pt-4 space-y-3">
        <h3 className="text-sm font-medium">Block Dates</h3>
        <div className="flex gap-2">
          <Input type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} className="text-sm flex-1" />
          <Button variant="outline" size="sm" onClick={handleAddBlockedDate} disabled={isPending || !blockDate}>
            Block
          </Button>
        </div>
        {blockedDates.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {blockedDates.map((d) => (
              <Badge key={d} variant="secondary" className="text-xs">
                {d}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
