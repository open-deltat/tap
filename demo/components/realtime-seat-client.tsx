"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { SeatMap, type SeatSection } from "@/components/seat-map";
import type { AvailabilitySlot, Booking, Hold } from "@/lib/schemas";
import { useResourceEvents } from "@/hooks/use-resource-events";
import { getMultiResourceAvailability } from "@/app/actions/availability";
import { getMultiResourceBookings } from "@/app/actions/bookings";
import { getMultiResourceHolds } from "@/app/actions/holds";
import { placeHold, releaseHold } from "@/app/actions/holds";

interface RealtimeSeatClientProps {
  clientLabel: string;
  clientColor: string;
  venueId: string;
  sections: SeatSection[];
  seatIds: string[];
  slotStart: number;
  slotEnd: number;
}

export function RealtimeSeatClient({
  clientLabel,
  clientColor,
  venueId,
  sections,
  seatIds,
  slotStart,
  slotEnd,
}: RealtimeSeatClientProps) {
  const [availability, setAvailability] = useState<Map<string, AvailabilitySlot[]>>(new Map());
  const [bookings, setBookings] = useState<Map<string, Booking[]>>(new Map());
  const [holds, setHolds] = useState<Map<string, Hold[]>>(new Map());
  const [myHoldIds, setMyHoldIds] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    if (seatIds.length === 0) return;
    try {
      const [availMap, bookMap, holdMap] = await Promise.all([
        getMultiResourceAvailability(seatIds, slotStart, slotEnd),
        getMultiResourceBookings(seatIds),
        getMultiResourceHolds(seatIds),
      ]);
      setAvailability(new Map(Object.entries(availMap)));
      const filtered = new Map<string, Booking[]>();
      for (const [id, bks] of Object.entries(bookMap)) {
        filtered.set(id, (bks as Booking[]).filter((b) => b.start < slotEnd && b.end > slotStart));
      }
      setBookings(filtered);

      const now = Date.now();
      const filteredHolds = new Map<string, Hold[]>();
      for (const [id, hs] of Object.entries(holdMap)) {
        filteredHolds.set(
          id,
          (hs as Hold[]).filter((h) => h.start < slotEnd && h.end > slotStart && h.expiresAt > now)
        );
      }
      setHolds(filteredHolds);
    } catch (err) {
      console.error(`${clientLabel}: Failed to load data`, err);
    }
  }, [seatIds, slotStart, slotEnd, clientLabel]);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // SSE: listen on venue — events bubble up from seats to venue in deltat
  useResourceEvents(venueId, () => {
    loadData();
  });

  async function handleSeatClick(seatId: string) {
    try {
      const hold = await placeHold({
        resourceId: seatId,
        start: slotStart,
        end: slotEnd,
        durationMinutes: 15,
      });
      setMyHoldIds((prev) => new Set(prev).add(hold.id));
      toast.success(`${clientLabel}: Hold placed`);
      await loadData();
    } catch (err: any) {
      toast.error(err.message ?? `${clientLabel}: Failed to place hold`);
    }
  }

  async function handleHoldClick(hold: Hold) {
    if (!myHoldIds.has(hold.id)) {
      toast.error(`${clientLabel}: This hold belongs to the other client`);
      return;
    }
    try {
      await releaseHold(hold.id);
      setMyHoldIds((prev) => {
        const next = new Set(prev);
        next.delete(hold.id);
        return next;
      });
      toast.success(`${clientLabel}: Hold released`);
      await loadData();
    } catch (err: any) {
      toast.error(err.message ?? `${clientLabel}: Failed to release hold`);
    }
  }

  return (
    <div className="flex flex-col items-center flex-1 min-w-0 p-4">
      <div className={`mb-4 px-3 py-1.5 rounded-full text-sm font-semibold ${clientColor}`}>
        {clientLabel}
      </div>
      <SeatMap
        sections={sections}
        availabilityByResource={availability}
        bookingsByResource={bookings}
        holdsByResource={holds}
        slotStart={slotStart}
        slotEnd={slotEnd}
        selectedIds={new Set()}
        onToggle={handleSeatClick}
        onBookingClick={() => {}}
        onHoldClick={handleHoldClick}
      />
    </div>
  );
}
