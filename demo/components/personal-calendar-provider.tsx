"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { ensurePersonalCalendar } from "@/app/actions/seed-personal-calendar";
import { getBookingsForResource } from "@/app/actions/bookings";
import { getHoldsForResource } from "@/app/actions/holds";
import { useWebSocket } from "@/hooks/use-websocket";
import { dayBounds } from "@/lib/time";
import type { Booking, Hold } from "@open-deltat/client";

interface PersonalCalendarContextValue {
  calendarId: string | null;
  bookings: Booking[];
  holds: Hold[];
}

const PersonalCalendarContext = createContext<PersonalCalendarContextValue>({
  calendarId: null,
  bookings: [],
  holds: [],
});

export function usePersonalCalendar() {
  return useContext(PersonalCalendarContext);
}

export function PersonalCalendarProvider({ children }: { children: React.ReactNode }) {
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [holds, setHolds] = useState<Hold[]>([]);

  const { dayStart, dayEnd } = useMemo(() => dayBounds(new Date()), []);

  const loadData = useCallback(async () => {
    if (!calendarId) return;
    const [allBookings, allHolds] = await Promise.all([
      getBookingsForResource(calendarId),
      getHoldsForResource(calendarId),
    ]);
    const now = Date.now();
    setBookings(allBookings.filter((b) => b.start < dayEnd && b.end > dayStart));
    setHolds(allHolds.filter((h) => h.start < dayEnd && h.end > dayStart && h.expiresAt > now));
  }, [calendarId, dayStart, dayEnd]);

  useEffect(() => {
    ensurePersonalCalendar().then(setCalendarId);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;
  const onWsEvent = useCallback(() => { loadDataRef.current(); }, []);

  useWebSocket(
    calendarId
      ? { type: "subscribe", resourceId: calendarId, onEvent: onWsEvent }
      : null
  );

  return (
    <PersonalCalendarContext.Provider value={{ calendarId, bookings, holds }}>
      {children}
    </PersonalCalendarContext.Provider>
  );
}
