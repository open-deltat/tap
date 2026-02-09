"use client";

import { Fragment, useMemo } from "react";
import { ChevronLeft, ChevronRight, Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, weekDays, formatDayShort, formatSlotTime, dayHourMs } from "@/lib/utils";
import type { AvailabilitySlot, Booking } from "@/lib/schemas";

interface WeekCalendarProps {
  weekOf: Date;
  onWeekChange: (date: Date) => void;
  availability: AvailabilitySlot[];
  bookings: Booking[];
  resourceName: string | null;
  slotMinutes?: number;
  onSlotClick: (start: number, end: number) => void;
  onBookingClick: (booking: Booking) => void;
  startHour?: number;
  endHour?: number;
  hasChildren?: boolean;
  onDayView?: () => void;
}

export function WeekCalendar({
  weekOf,
  onWeekChange,
  availability,
  bookings,
  resourceName,
  slotMinutes = 60,
  onSlotClick,
  onBookingClick,
  startHour = 6,
  endHour = 22,
  hasChildren,
  onDayView,
}: WeekCalendarProps) {
  const days = useMemo(() => weekDays(weekOf), [weekOf]);
  const slotMs = slotMinutes * 60_000;

  // Generate time slots: each slot is { hour, minute, label }
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

  // Cell height scales with slot duration
  const cellHeight = slotMinutes <= 15 ? 20 : slotMinutes <= 30 ? 30 : 40;

  // Build a Set of available slots for O(1) lookup
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

  // Build a map of booked slots
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
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">
            {resourceName ?? "Select a resource"}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          {hasChildren && onDayView && (
            <Button variant="outline" size="sm" onClick={onDayView}>
              <Columns3 className="mr-1 h-3.5 w-3.5" />
              Day
            </Button>
          )}
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

      {/* Grid */}
      {!resourceName ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          Select a resource to view its calendar
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="grid min-w-[700px]" style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}>
            {/* Day headers */}
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

            {/* Time slot rows */}
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
                        isAvailable && !booking && !isPast && "bg-emerald-50 hover:bg-emerald-100 cursor-pointer",
                        isAvailable && !booking && isPast && "bg-emerald-50/50",
                        booking && !isPast && "bg-blue-100 hover:bg-blue-200 cursor-pointer",
                        booking && isPast && "bg-blue-50"
                      )}
                      style={{ minHeight: `${cellHeight}px` }}
                      onClick={() => {
                        if (isPast) return;
                        if (booking) {
                          onBookingClick(booking);
                        } else if (isAvailable) {
                          onSlotClick(cellStart, cellEnd);
                        }
                      }}
                    >
                      {booking && (
                        <div className="px-1 py-0.5 text-[10px] font-medium text-blue-700 truncate">
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
      )}
    </div>
  );
}
