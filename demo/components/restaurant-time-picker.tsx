"use client";

import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/time";
import type { AvailabilitySlot } from "@open-tap/client";

const SLOT_DURATION = 90 * 60_000;

interface TimePickerProps {
  slots: AvailabilitySlot[];
  selectedStart: number | null;
  onSelect: (start: number, end: number) => void;
}

export function RestaurantTimePicker({ slots, selectedStart, onSelect }: TimePickerProps) {
  const timeSlots: { start: number; end: number }[] = [];
  for (const slot of slots) {
    let cursor = slot.start;
    while (cursor + SLOT_DURATION <= slot.end) {
      timeSlots.push({ start: cursor, end: cursor + SLOT_DURATION });
      cursor += 30 * 60_000;
    }
  }

  if (timeSlots.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-center">
        <div className="text-xs text-muted-foreground">No available times for this table</div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {timeSlots.map((slot) => {
        const isActive = selectedStart === slot.start;
        return (
          <button
            key={slot.start}
            onClick={() => onSelect(slot.start, slot.end)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:border-primary/50 hover:bg-accent"
            )}
          >
            {formatTime(slot.start)}
          </button>
        );
      })}
    </div>
  );
}
