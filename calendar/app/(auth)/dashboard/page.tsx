"use client";

import { useState, useEffect, useCallback } from "react";
import { WeekCalendar } from "@/components/week-calendar";
import { getWeekData } from "@/app/actions/calendar";
import { weekStart as getWeekStart, weekEnd as getWeekEnd } from "@/lib/utils";
import type { AvailabilitySlot, Booking } from "@open-tap/client";

export default function DashboardPage() {
  const [weekOf, setWeekOf] = useState(() => new Date());
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  const loadWeek = useCallback(async (date: Date) => {
    const start = getWeekStart(date).getTime();
    const end = getWeekEnd(date).getTime();
    const data = await getWeekData(start, end);
    setAvailability(data.availability);
    setBookings(data.bookings);
  }, []);

  useEffect(() => {
    loadWeek(weekOf);
  }, [weekOf, loadWeek]);

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 pb-0">
        <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>
      </div>
      <div className="flex-1 min-h-0 px-6 pb-6">
        <div className="h-full rounded-lg border bg-card">
          <WeekCalendar
            weekOf={weekOf}
            onWeekChange={setWeekOf}
            availability={availability}
            bookings={bookings}
          />
        </div>
      </div>
    </div>
  );
}
