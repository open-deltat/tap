"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { SeatMap, type SeatSection } from "@/components/seat-map";
import type { AvailabilitySlot, Booking, Hold } from "@/lib/schemas";
import { useWebSocket, wsUrl } from "@/hooks/use-websocket";
import { getMultiResourceAvailability } from "@/app/actions/availability";
import { getMultiResourceBookings } from "@/app/actions/bookings";
import { getMultiResourceHolds } from "@/app/actions/holds";

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
  const [myHoldIds, setMyHoldIds] = useState<Map<string, string>>(new Map());

  const holdConnections = useRef(new Map<string, WebSocket>());

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

  useEffect(() => {
    loadData();
  }, [loadData]);

  useWebSocket({
    type: "subscribe",
    resourceId: venueId,
    onEvent: useCallback(() => {
      loadData();
    }, [loadData]),
  });

  useEffect(() => {
    return () => {
      holdConnections.current.forEach((ws) => ws.close());
      holdConnections.current.clear();
    };
  }, []);

  function handleSeatClick(seatId: string) {
    if (holdConnections.current.has(seatId)) return;

    const ws = new WebSocket(wsUrl());

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "hold",
          resourceId: seatId,
          start: slotStart,
          end: slotEnd,
          durationMinutes: 15,
        })
      );
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "hold_placed") {
          setMyHoldIds((prev) => new Map(prev).set(seatId, data.hold.id));
          toast.success(`${clientLabel}: Hold placed`);
          loadData();
        } else if (data.type === "error") {
          toast.error(data.message ?? `${clientLabel}: Failed to place hold`);
          ws.close();
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      holdConnections.current.delete(seatId);
      setMyHoldIds((prev) => {
        const next = new Map(prev);
        next.delete(seatId);
        return next;
      });
      loadData();
    };

    holdConnections.current.set(seatId, ws);
  }

  function handleHoldClick(hold: Hold) {
    let seatId: string | null = null;
    for (const [sid, hid] of myHoldIds) {
      if (hid === hold.id) {
        seatId = sid;
        break;
      }
    }

    if (!seatId) {
      toast.error(`${clientLabel}: This hold belongs to the other client`);
      return;
    }

    const ws = holdConnections.current.get(seatId);
    if (ws) {
      ws.close();
      toast.success(`${clientLabel}: Hold released`);
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
