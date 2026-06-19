"use client";

import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/time";
import type { AvailabilitySlot } from "@/lib/schemas";

const SLOT_DURATION = 90 * 60_000;
const SLOT_STEP = 30 * 60_000;

export function restaurantTimeSlots(slots: AvailabilitySlot[]): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const slot of slots) {
    let cursor = slot.start;
    while (cursor + SLOT_DURATION <= slot.end) {
      out.push({ start: cursor, end: cursor + SLOT_DURATION });
      cursor += SLOT_STEP;
    }
  }
  return out;
}

interface TimePickerProps {
  slots: { start: number; end: number }[];
  selectedStart: number | null;
  onSelect: (start: number, end: number) => void;
}

export function RestaurantTimePicker({ slots, selectedStart, onSelect }: TimePickerProps) {
  if (slots.length === 0) {
    return <div className="text-[11px] text-zinc-500">No available times today</div>;
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {slots.map((slot) => {
        const active = selectedStart === slot.start;
        return (
          <button
            key={slot.start}
            onClick={() => onSelect(slot.start, slot.end)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              active
                ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                : "border-white/10 text-zinc-400 hover:text-zinc-200"
            )}
          >
            {formatTime(slot.start)}
          </button>
        );
      })}
    </div>
  );
}
