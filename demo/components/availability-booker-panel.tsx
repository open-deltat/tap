"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toLocalDateString, formatTime, dayBounds } from "@/lib/time";
import { formatError } from "@/lib/format-error";
import { getAvailability } from "@/app/actions/availability";
import { useHoldWebSocket, useWebSocket } from "@/hooks/use-websocket";
import type { AvailabilitySlot } from "@open-tap/client";

const SLOT_DURATION = 30 * 60_000;

interface BookerPanelProps {
  resourceId: string;
}

export function AvailabilityBookerPanel({ resourceId }: BookerPanelProps) {
  const [date, setDate] = useState(toLocalDateString(new Date()));
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<{ start: number; end: number } | null>(null);
  const [bookingName, setBookingName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const loadSlots = useCallback(async () => {
    const d = new Date(date + "T00:00:00");
    const { dayStart, dayEnd } = dayBounds(d);
    try {
      const raw = await getAvailability(resourceId, dayStart, dayEnd);
      const expanded: AvailabilitySlot[] = [];
      for (const slot of raw) {
        let cursor = slot.start;
        while (cursor + SLOT_DURATION <= slot.end) {
          expanded.push({ start: cursor, end: cursor + SLOT_DURATION });
          cursor += SLOT_DURATION;
        }
      }
      setSlots(expanded);
    } catch {
      setSlots([]);
    }
  }, [resourceId, date]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  useEffect(() => {
    setSelectedSlot(null);
    setConfirmed(false);
  }, [date]);

  const onWsEvent = useCallback(() => { loadSlots(); }, [loadSlots]);
  useWebSocket(resourceId ? { type: "subscribe", resourceId, onEvent: onWsEvent } : null);

  const holdOpts = selectedSlot && !confirmed
    ? { resourceId, start: selectedSlot.start, end: selectedSlot.end, onEvent: onWsEvent }
    : null;
  const { connected, confirm } = useHoldWebSocket(holdOpts);

  function prevDay() {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    setDate(toLocalDateString(d));
  }

  function nextDay() {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    setDate(toLocalDateString(d));
  }

  function handleSelectSlot(slot: AvailabilitySlot) {
    if (selectedSlot?.start === slot.start) {
      setSelectedSlot(null);
      setConfirmed(false);
    } else {
      setSelectedSlot(slot);
      setConfirmed(false);
    }
  }

  function handleConfirm() {
    if (!selectedSlot) return;
    startTransition(async () => {
      try {
        await confirm(bookingName || undefined);
        setConfirmed(true);
        setBookingName("");
        toast.success("Appointment confirmed!");
      } catch (err: any) {
        toast.error(formatError(err.message));
      }
    });
  }

  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs font-medium">Select Date</Label>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevDay}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="text-sm" />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextDay}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">{dateLabel}</div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium">
          {slots.length > 0 ? `${slots.length} Available Slots` : "Available Slots"}
        </Label>

        {slots.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center">
            <div className="text-xs text-muted-foreground">No availability on this date</div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 max-h-[320px] overflow-auto">
            {slots.map((slot) => {
              const isActive = selectedSlot?.start === slot.start;
              return (
                <button
                  key={slot.start}
                  onClick={() => handleSelectSlot(slot)}
                  className={cn(
                    "rounded-md border px-2.5 py-2 text-xs font-medium transition-all",
                    isActive
                      ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-700"
                      : "border-border hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-950/30"
                  )}
                >
                  {formatTime(slot.start)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedSlot && !confirmed && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="text-sm font-medium">
            {formatTime(selectedSlot.start)} – {formatTime(selectedSlot.end)}
          </div>
          {connected && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600">
              <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              Slot held for you (5 min)
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Your Name</Label>
            <Input
              placeholder="e.g. John Smith"
              value={bookingName}
              onChange={(e) => setBookingName(e.target.value)}
              className="text-sm"
            />
          </div>
          <Button onClick={handleConfirm} disabled={isPending || !connected} className="w-full" size="sm">
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Confirm Appointment
          </Button>
        </div>
      )}

      {confirmed && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
            <Check className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <div className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Booked!</div>
            <div className="text-xs text-emerald-600 dark:text-emerald-400">
              {selectedSlot && `${formatTime(selectedSlot.start)} – ${formatTime(selectedSlot.end)}`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
