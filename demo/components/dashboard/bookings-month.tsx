"use client";

import { useMemo } from "react";
import {
  CalendarBody,
  CalendarDate,
  CalendarDatePagination,
  CalendarHeader,
  CalendarLabel,
  CalendarProvider,
  type Feature,
} from "@open-deltat/examples/components/ui/kibo-ui/calendar";

// The month overview: every booking as an item in its day cell, Google-Calendar style. Clicking a
// day drops into that day's timeline, so this is the "where is my month at a glance" view and the
// day view stays the detail. Built on the kibo calendar the examples already use.

export interface MonthBooking {
  id: string;
  start: number;
  end: number;
  label: string | null;
}

const BOOKED = { id: "booked", name: "Booked", color: "#10b981" } as const;

export function BookingsMonth({
  bookings,
  timezone,
  onSelectDay,
}: {
  bookings: MonthBooking[];
  timezone: string;
  onSelectDay: (date: Date) => void;
}) {
  const time = useMemo(
    () => new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", timeZone: timezone }),
    [timezone]
  );

  const features: Feature[] = useMemo(
    () =>
      bookings.map((b) => ({
        id: b.id,
        name: `${time.format(b.start)} ${b.label ?? "Booked"}`,
        startAt: new Date(b.start),
        endAt: new Date(b.end),
        status: BOOKED,
      })),
    [bookings, time]
  );

  return (
    <CalendarProvider startDay={1} className="rounded-lg border p-3">
      <CalendarDate>
        <CalendarLabel className="text-foreground" />
        <CalendarDatePagination />
      </CalendarDate>
      <CalendarHeader />
      <CalendarBody features={features} onSelectDay={(date) => onSelectDay(date)}>
        {({ feature }) => (
          <div className="flex items-center gap-1.5 truncate text-xs">
            <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: feature.status.color }} />
            <span className="truncate">{feature.name}</span>
          </div>
        )}
      </CalendarBody>
    </CalendarProvider>
  );
}
