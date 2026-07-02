"use client";

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

  // One dropdown rather than a wall of pills: a 90-min seating starting at the chosen time.
  return (
    <label className="flex items-center gap-2 text-[11px] text-zinc-500">
      Seating
      <select
        value={selectedStart ?? ""}
        onChange={(e) => {
          const start = Number(e.target.value);
          const slot = slots.find((s) => s.start === start);
          if (slot) onSelect(slot.start, slot.end);
        }}
        className="h-8 rounded-md border border-white/10 bg-white/5 px-2.5 text-xs text-zinc-200 [color-scheme:dark] focus:border-emerald-400/40 focus:outline-none"
      >
        {slots.map((slot) => (
          <option key={slot.start} value={slot.start} className="bg-zinc-900 text-zinc-100">
            {formatTime(slot.start)} to {formatTime(slot.end)}
          </option>
        ))}
      </select>
    </label>
  );
}
