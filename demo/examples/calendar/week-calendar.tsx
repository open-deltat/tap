"use client";

import { Fragment, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, weekDays, formatDayShort, formatSlotTime, dayHourMs } from "@/lib/utils";
import type { AvailabilitySlot, Booking } from "@/lib/schemas";

interface WeekCalendarProps {
  weekOf: Date;
  onWeekChange: (date: Date) => void;
  availability: AvailabilitySlot[];
  bookings: Booking[];
  slotMinutes?: number;
  onSlotClick: (start: number, end: number) => void;
  onBookingClick: (booking: Booking) => void;
  startHour?: number;
  endHour?: number;
}

export function WeekCalendar({
  weekOf,
  onWeekChange,
  availability,
  bookings,
  slotMinutes = 60,
  onSlotClick,
  onBookingClick,
  startHour = 6,
  endHour = 22,
}: WeekCalendarProps) {
  const days = useMemo(() => weekDays(weekOf), [weekOf]);
  const slotMs = slotMinutes * 60_000;

  const slots = useMemo(() => {
    const totalMinutes = (endHour - startHour) * 60;
    const count = Math.floor(totalMinutes / slotMinutes);
    return Array.from({ length: count }, (_, i) => {
      const minuteFromStart = i * slotMinutes;
      const hour = startHour + Math.floor(minuteFromStart / 60);
      const minute = minuteFromStart % 60;
      return { hour, minute, label: formatSlotTime(hour, minute) };
    });
  }, [startHour, endHour, slotMinutes]);

  const cellHeight = slotMinutes <= 15 ? 20 : slotMinutes <= 30 ? 30 : 40;

  // A cell is bookable only if it fits ENTIRELY inside a free window (matches deltat's
  // conflict check — an overlap test would mark buffered tails clickable, then get rejected).
  const availableSet = useMemo(() => {
    const set = new Set<string>();
    for (const slot of availability) {
      for (const day of days) {
        for (const s of slots) {
          const cellStart = dayHourMs(day, s.hour, s.minute);
          const cellEnd = cellStart + slotMs;
          if (cellStart >= slot.start && cellEnd <= slot.end) {
            set.add(`${day.toDateString()}-${s.hour}-${s.minute}`);
          }
        }
      }
    }
    return set;
  }, [availability, days, slots, slotMs]);

  const bookingMap = useMemo(() => {
    const map = new Map<string, Booking>();
    for (const booking of bookings) {
      for (const day of days) {
        for (const s of slots) {
          const cellStart = dayHourMs(day, s.hour, s.minute);
          const cellEnd = cellStart + slotMs;
          if (cellStart < booking.end && cellEnd > booking.start) {
            map.set(`${day.toDateString()}-${s.hour}-${s.minute}`, booking);
          }
        }
      }
    }
    return map;
  }, [bookings, days, slots, slotMs]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function shiftWeek(deltaDays: number) {
    const d = new Date(weekOf);
    d.setDate(d.getDate() + deltaDays);
    onWeekChange(d);
  }

  const weekRange = `${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end gap-1 pb-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-zinc-300 hover:text-zinc-100"
          onClick={() => onWeekChange(new Date())}
        >
          Today
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-300" onClick={() => shiftWeek(-7)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[150px] text-center text-sm text-zinc-300">{weekRange}</span>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-300" onClick={() => shiftWeek(7)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto rounded-xl border border-white/10">
        <div className="grid min-w-[680px]" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
          <div className="sticky top-0 z-10 border-b border-white/10 bg-[#0a0a0c]" />
          {days.map((day) => {
            const isToday = day.toDateString() === today.toDateString();
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "sticky top-0 z-10 border-b border-white/10 bg-[#0a0a0c] px-2 py-2 text-center text-xs font-medium",
                  isToday ? "text-emerald-300" : "text-zinc-400"
                )}
              >
                {formatDayShort(day)}
              </div>
            );
          })}

          {slots.map((slot) => (
            <Fragment key={`row-${slot.hour}-${slot.minute}`}>
              <div
                className="border-b border-r border-white/[0.06] px-2 py-1 text-right text-[11px] text-zinc-600"
                style={{ minHeight: `${cellHeight}px` }}
              >
                {slot.label}
              </div>
              {days.map((day) => {
                const key = `${day.toDateString()}-${slot.hour}-${slot.minute}`;
                const isAvailable = availableSet.has(key);
                const booking = bookingMap.get(key);
                const cellStart = dayHourMs(day, slot.hour, slot.minute);
                const cellEnd = cellStart + slotMs;
                const isPast = cellEnd < Date.now();

                return (
                  <div
                    key={key}
                    className={cn(
                      "border-b border-r border-white/[0.06] transition-colors",
                      !isAvailable && !booking && "bg-white/[0.015]",
                      isAvailable && !booking && !isPast && "cursor-pointer bg-emerald-500/10 hover:bg-emerald-500/20",
                      isAvailable && !booking && isPast && "bg-emerald-500/[0.04]",
                      booking && !isPast && "cursor-pointer bg-sky-500/20 hover:bg-sky-500/30",
                      booking && isPast && "bg-sky-500/10"
                    )}
                    style={{ minHeight: `${cellHeight}px` }}
                    onClick={() => {
                      if (isPast) return;
                      if (booking) onBookingClick(booking);
                      else if (isAvailable) onSlotClick(cellStart, cellEnd);
                    }}
                  >
                    {booking && (
                      <div className="truncate px-1 py-0.5 text-[10px] font-medium text-sky-200">
                        {booking.label || "Booked"}
                      </div>
                    )}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
