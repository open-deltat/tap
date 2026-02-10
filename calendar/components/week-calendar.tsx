"use client";

import { Fragment, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, weekDays, formatDayShort, formatSlotTime, dayHourMs } from "@/lib/utils";
import type { AvailabilitySlot, Booking } from "@open-tap/client";

interface WeekCalendarProps {
  weekOf: Date;
  onWeekChange: (date: Date) => void;
  availability: AvailabilitySlot[];
  bookings: Booking[];
  slotMinutes?: number;
  startHour?: number;
  endHour?: number;
}

function parseBookingLabel(label: string | null): string {
  if (!label) return "Booked";
  const match = label.match(/^(.+?)\s*<.+>$/);
  return match ? match[1] : label;
}

export function WeekCalendar({
  weekOf,
  onWeekChange,
  availability,
  bookings,
  slotMinutes = 30,
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

  const availableSet = useMemo(() => {
    const set = new Set<string>();
    for (const slot of availability) {
      for (const day of days) {
        for (const s of slots) {
          const cellStart = dayHourMs(day, s.hour, s.minute);
          const cellEnd = cellStart + slotMs;
          if (cellStart < slot.end && cellEnd > slot.start) {
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

  function prevWeek() {
    const d = new Date(weekOf);
    d.setDate(d.getDate() - 7);
    onWeekChange(d);
  }

  function nextWeek() {
    const d = new Date(weekOf);
    d.setDate(d.getDate() + 7);
    onWeekChange(d);
  }

  function goToday() {
    onWeekChange(new Date());
  }

  const weekRange = `${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Calendar</h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[160px] text-center text-sm">{weekRange}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="grid min-w-[700px]" style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}>
          <div className="sticky top-0 z-10 border-b bg-background" />
          {days.map((day) => {
            const isToday = day.toDateString() === today.toDateString();
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "sticky top-0 z-10 border-b bg-background px-2 py-2 text-center text-xs font-medium",
                  isToday && "text-primary"
                )}
              >
                <span className={cn(isToday && "rounded-full bg-primary text-primary-foreground px-2 py-0.5")}>
                  {formatDayShort(day)}
                </span>
              </div>
            );
          })}

          {slots.map((slot) => (
            <Fragment key={`row-${slot.hour}-${slot.minute}`}>
              <div
                className="border-b border-r px-2 py-1 text-right text-[11px] text-muted-foreground"
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
                      "border-b border-r cursor-default transition-colors",
                      !isAvailable && !booking && "bg-muted/30",
                      isAvailable && !booking && !isPast && "bg-emerald-50",
                      isAvailable && !booking && isPast && "bg-emerald-50/50",
                      booking && !isPast && "bg-blue-100",
                      booking && isPast && "bg-blue-50"
                    )}
                    style={{ minHeight: `${cellHeight}px` }}
                  >
                    {booking && (
                      <div className="px-1 py-0.5 text-[10px] font-medium text-blue-700 truncate">
                        {parseBookingLabel(booking.label)}
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
