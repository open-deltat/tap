"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Resource } from "@/lib/schemas";

interface AddRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceId: string;
  resources: Resource[];
  onSubmit: (data: {
    resourceId: string;
    start: number;
    end: number;
    blocking: boolean;
  }) => void;
  onRecurringSubmit?: (data: {
    resourceId: string;
    daysOfWeek: number[];
    startTime: string;
    endTime: string;
    fromDate: string;
    toDate: string;
    blocking: boolean;
  }) => void;
}

function toLocalDatetimeString(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function toLocalDateString(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface PresetConfig {
  label: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
}

const PRESETS: PresetConfig[] = [
  { label: "Business Hours", daysOfWeek: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "17:00" },
  { label: "Always Open", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: "00:00", endTime: "23:59" },
  { label: "Weekends", daysOfWeek: [0, 6], startTime: "09:00", endTime: "17:00" },
];

export function AddRuleDialog({
  open,
  onOpenChange,
  resourceId,
  resources,
  onSubmit,
  onRecurringSubmit,
}: AddRuleDialogProps) {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const defaultEnd = new Date(now.getTime() + 12 * 3600000);
  const thirtyDaysLater = new Date(now.getTime() + 30 * 86400000);

  // Single mode state
  const [start, setStart] = useState(toLocalDatetimeString(now));
  const [end, setEnd] = useState(toLocalDatetimeString(defaultEnd));
  const [blocking, setBlocking] = useState(false);

  // Recurring mode state
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [fromDate, setFromDate] = useState(toLocalDateString(now));
  const [toDate, setToDate] = useState(toLocalDateString(thirtyDaysLater));
  const [recurringBlocking, setRecurringBlocking] = useState(false);

  const resourceName =
    resources.find((r) => r.id === resourceId)?.name ?? "Unknown";

  // Count how many rules will be created
  const ruleCount = useMemo(() => {
    if (daysOfWeek.length === 0) return 0;
    const from = new Date(fromDate);
    const to = new Date(toDate);
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) return 0;
    let count = 0;
    const d = new Date(from);
    while (d <= to) {
      if (daysOfWeek.includes(d.getDay())) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }, [daysOfWeek, fromDate, toDate]);

  function handleSingleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    if (endMs <= startMs) return;
    onSubmit({ resourceId, start: startMs, end: endMs, blocking });
    onOpenChange(false);
  }

  function handleRecurringSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!onRecurringSubmit || daysOfWeek.length === 0 || ruleCount === 0) return;
    onRecurringSubmit({
      resourceId,
      daysOfWeek,
      startTime,
      endTime,
      fromDate,
      toDate,
      blocking: recurringBlocking,
    });
    onOpenChange(false);
  }

  function toggleDay(day: number) {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  function applyPreset(preset: PresetConfig) {
    setDaysOfWeek(preset.daysOfWeek);
    setStartTime(preset.startTime);
    setEndTime(preset.endTime);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add rule to &ldquo;{resourceName}&rdquo;</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="single">
          <TabsList className="w-full">
            <TabsTrigger value="single" className="flex-1">Single</TabsTrigger>
            <TabsTrigger value="recurring" className="flex-1">Recurring</TabsTrigger>
          </TabsList>

          <TabsContent value="single">
            <form onSubmit={handleSingleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rule-start">Start</Label>
                <Input
                  id="rule-start"
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-end">End</Label>
                <Input
                  id="rule-end"
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="blocking"
                  type="checkbox"
                  checked={blocking}
                  onChange={(e) => setBlocking(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="blocking" className="font-normal">
                  Blocking (prevents bookings during this time)
                </Label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit">Add Rule</Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="recurring">
            <form onSubmit={handleRecurringSubmit} className="space-y-4">
              {/* Presets */}
              <div className="space-y-2">
                <Label>Presets</Label>
                <div className="flex gap-2">
                  {PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applyPreset(preset)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Day checkboxes */}
              <div className="space-y-2">
                <Label>Days</Label>
                <div className="flex gap-1">
                  {DAY_LABELS.map((label, i) => (
                    <button
                      key={label}
                      type="button"
                      className={cn(
                        "h-8 w-10 rounded-md text-xs font-medium transition-colors",
                        daysOfWeek.includes(i)
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                      onClick={() => toggleDay(i)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time range */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rec-start-time">Start Time</Label>
                  <Input
                    id="rec-start-time"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rec-end-time">End Time</Label>
                  <Input
                    id="rec-end-time"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>

              {/* Date range */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rec-from-date">From Date</Label>
                  <Input
                    id="rec-from-date"
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rec-to-date">To Date</Label>
                  <Input
                    id="rec-to-date"
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="recurring-blocking"
                  type="checkbox"
                  checked={recurringBlocking}
                  onChange={(e) => setRecurringBlocking(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="recurring-blocking" className="font-normal">
                  Blocking (prevents bookings during this time)
                </Label>
              </div>

              {ruleCount > 0 && (
                <p className="text-sm text-muted-foreground">
                  Will create {ruleCount} rule{ruleCount !== 1 ? "s" : ""}
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={ruleCount === 0}>
                  Add {ruleCount} Rule{ruleCount !== 1 ? "s" : ""}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
