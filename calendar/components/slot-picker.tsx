"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toLocalDateString, formatTime } from "@/lib/time";
import { getPublicSlots } from "@/app/actions/public";
import { BookingForm } from "./booking-form";

interface SlotPickerProps {
  slug: string;
  slotMinutes: number;
}

export function SlotPicker({ slug, slotMinutes }: SlotPickerProps) {
  const [date, setDate] = useState(toLocalDateString(new Date()));
  const [slots, setSlots] = useState<{ start: number; end: number }[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<{ start: number; end: number } | null>(null);

  const loadSlots = useCallback(async () => {
    const data = await getPublicSlots(slug, date);
    setSlots(data);
    setSelectedSlot(null);
  }, [slug, date]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  function prevDay() {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() - 1);
    setDate(toLocalDateString(d));
  }

  function nextDay() {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + 1);
    setDate(toLocalDateString(d));
  }

  function handleSelectSlot(slot: { start: number; end: number }) {
    setSelectedSlot(selectedSlot?.start === slot.start ? null : slot);
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
                      ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                      : "border-border hover:border-blue-300 hover:bg-blue-50/50"
                  )}
                >
                  {formatTime(slot.start)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedSlot && (
        <BookingForm slug={slug} start={selectedSlot.start} end={selectedSlot.end} />
      )}
    </div>
  );
}
