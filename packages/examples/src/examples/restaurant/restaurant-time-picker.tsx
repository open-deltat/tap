"use client";

import { formatTime } from "@open-deltat/shared/time";
import { cn } from "@open-deltat/shared/utils";
import { PILL_ACTIVE, PILL_BASE, PILL_IDLE } from "../../lib/accent";
import type { AvailabilitySlot } from "../../lib/schemas";

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

// The seating start times as the same pills every example uses, in one row that scrolls sideways
// (one direction per section) instead of a native dropdown that looks like no other control here.
export function RestaurantTimePicker({ slots, selectedStart, onSelect }: TimePickerProps) {
  if (slots.length === 0) {
    return <div className="text-[13px] text-dt-ink-3">No available times today</div>;
  }

  return (
    <div role="group" aria-label="Seating time" className="flex w-full max-w-full gap-1.5 overflow-x-auto pb-1">

      {slots.map((slot) => {
        const active = slot.start === selectedStart;
        return (
          <button
            key={slot.start}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(slot.start, slot.end)}
            className={cn(PILL_BASE, "shrink-0 tabular-nums", active ? PILL_ACTIVE : PILL_IDLE)}
          >
            {formatTime(slot.start)}
          </button>
        );
      })}
    </div>
  );
}
