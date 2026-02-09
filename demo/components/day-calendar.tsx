"use client";

import { Fragment, useMemo } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatDayShort, formatSlotTime, dayHourMs } from "@/lib/utils";
import type { AvailabilitySlot, Booking } from "@/lib/schemas";

interface DayCalendarProps {
  date: Date;
  onDateChange: (date: Date) => void;
  resources: { id: string; name: string }[];
  availabilityByResource: Map<string, AvailabilitySlot[]>;
  bookingsByResource: Map<string, Booking[]>;
  slotMinutes: number;
  onSlotClick: (resourceId: string, start: number, end: number) => void;
  onBookingClick: (booking: Booking) => void;
  onViewChange: () => void;
  startHour?: number;
  endHour?: number;
}

export function DayCalendar({
  date,
  onDateChange,
  resources,
  availabilityByResource,
  bookingsByResource,
  slotMinutes,
  onSlotClick,
  onBookingClick,
  onViewChange,
  startHour = 6,
  endHour = 22,
}: DayCalendarProps) {
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

  // Build per-resource availability sets and booking maps
  const resourceData = useMemo(() => {
    const data = new Map<string, { availSet: Set<string>; bookMap: Map<string, Booking> }>();
    for (const res of resources) {
      const avail = availabilityByResource.get(res.id) ?? [];
      const bks = bookingsByResource.get(res.id) ?? [];

      const availSet = new Set<string>();
      for (const slot of avail) {
        for (const s of slots) {
          const cellStart = dayHourMs(date, s.hour, s.minute);
          const cellEnd = cellStart + slotMs;
          if (cellStart < slot.end && cellEnd > slot.start) {
            availSet.add(`${s.hour}-${s.minute}`);
          }
        }
      }

      const bookMap = new Map<string, Booking>();
      for (const booking of bks) {
        for (const s of slots) {
          const cellStart = dayHourMs(date, s.hour, s.minute);
          const cellEnd = cellStart + slotMs;
          if (cellStart < booking.end && cellEnd > booking.start) {
            bookMap.set(`${s.hour}-${s.minute}`, booking);
          }
        }
      }

      data.set(res.id, { availSet, bookMap });
    }
    return data;
  }, [resources, availabilityByResource, bookingsByResource, date, slots, slotMs]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function prevDay() {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    onDateChange(d);
  }

  function nextDay() {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    onDateChange(d);
  }

  function goToday() {
    onDateChange(new Date());
  }

  const dateLabel = date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Day View</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={onViewChange}>
            <Calendar className="mr-1 h-3.5 w-3.5" />
            Week
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevDay}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[200px] text-center text-sm">{dateLabel}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextDay}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <div
          className="grid min-w-[400px]"
          style={{ gridTemplateColumns: `60px repeat(${resources.length}, 1fr)` }}
        >
          {/* Resource headers */}
          <div className="sticky top-0 z-10 border-b bg-background" />
          {resources.map((res) => (
            <div
              key={res.id}
              className="sticky top-0 z-10 border-b bg-background px-2 py-2 text-center text-xs font-medium truncate"
            >
              {res.name}
            </div>
          ))}

          {/* Time slot rows */}
          {slots.map((slot) => (
            <Fragment key={`row-${slot.hour}-${slot.minute}`}>
              <div
                className="border-b border-r px-2 py-1 text-right text-[11px] text-muted-foreground"
                style={{ minHeight: `${cellHeight}px` }}
              >
                {slot.label}
              </div>
              {resources.map((res) => {
                const data = resourceData.get(res.id);
                const key = `${slot.hour}-${slot.minute}`;
                const isAvailable = data?.availSet.has(key) ?? false;
                const booking = data?.bookMap.get(key);
                const cellStart = dayHourMs(date, slot.hour, slot.minute);
                const cellEnd = cellStart + slotMs;
                const isPast = cellEnd < Date.now();

                return (
                  <div
                    key={`${res.id}-${key}`}
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
                        onSlotClick(res.id, cellStart, cellEnd);
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
    </div>
  );
}
