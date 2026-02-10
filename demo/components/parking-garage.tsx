"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toLocalDateString, dayBounds } from "@/lib/time";
import { formatError } from "@/lib/format-error";
import { getResources } from "@/app/actions/resources";
import { getAvailability, getMultiResourceAvailability } from "@/app/actions/availability";
import { getMultiResourceBookings } from "@/app/actions/bookings";
import { getMultiResourceHolds } from "@/app/actions/holds";
import { ParkingGrid } from "@/components/parking-grid";
import { ParkingControls } from "@/components/parking-controls";
import { useHoldWebSocket, useWebSocket } from "@/hooks/use-websocket";
import type { Resource } from "@/lib/schemas";

interface Spot {
  id: string;
  name: string;
  zone: string;
  floorName: string;
}

interface ParkingGarageProps {
  garageId: string;
}

export function ParkingGarage({ garageId }: ParkingGarageProps) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [date, setDate] = useState(toLocalDateString(new Date()));
  const [activeFloor, setActiveFloor] = useState<string | null>(null);
  const [duration, setDuration] = useState(120);
  const [startTime, setStartTime] = useState(() => {
    const now = new Date();
    const totalMin = now.getHours() * 60 + Math.ceil(now.getMinutes() / 15) * 15;
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  });

  const [availableIds, setAvailableIds] = useState<Set<string>>(new Set());
  const [bookedIds, setBookedIds] = useState<Set<string>>(new Set());
  const [heldIds, setHeldIds] = useState<Set<string>>(new Set());
  const [selectedSpot, setSelectedSpot] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Derive structure from resources
  const floors = resources.filter((r) => r.parentId === garageId);
  const zones = resources.filter((r) => floors.some((f) => f.id === r.parentId));
  const spots: Spot[] = resources
    .filter((r) => zones.some((z) => z.id === r.parentId))
    .map((r) => {
      const zone = zones.find((z) => z.id === r.parentId)!;
      const floor = floors.find((f) => f.id === zone.parentId)!;
      return {
        id: r.id,
        name: r.name ?? r.id,
        zone: (zone.name ?? "").replace("Zone ", ""),
        floorName: floor.name ?? floor.id,
      };
    });

  const activeFloorName = activeFloor ?? floors[0]?.name ?? null;
  const floorSpots = spots.filter((s) => s.floorName === activeFloorName);

  function getTimeRange(): { start: number; end: number } {
    const [h, m] = startTime.split(":").map(Number);
    const d = new Date(date + "T00:00:00");
    d.setHours(h, m, 0, 0);
    const start = d.getTime();
    return { start, end: start + duration * 60_000 };
  }

  // Load resources
  useEffect(() => {
    getResources().then(setResources).catch(() => {});
  }, []);

  // Load availability data
  const loadData = useCallback(async () => {
    const spotIds = spots.map((s) => s.id);
    if (spotIds.length === 0) return;

    const { start, end } = getTimeRange();

    try {
      const [availMap, bookMap, holdMap] = await Promise.all([
        getMultiResourceAvailability(spotIds, start, end),
        getMultiResourceBookings(spotIds),
        getMultiResourceHolds(spotIds),
      ]);

      const avail = new Set<string>();
      for (const [id, slots] of Object.entries(availMap)) {
        const totalAvail = slots.reduce((sum, s) => {
          const overlapStart = Math.max(s.start, start);
          const overlapEnd = Math.min(s.end, end);
          return sum + Math.max(0, overlapEnd - overlapStart);
        }, 0);
        if (totalAvail >= end - start) avail.add(id);
      }
      setAvailableIds(avail);

      const booked = new Set<string>();
      for (const [id, bks] of Object.entries(bookMap)) {
        if (bks.some((b) => b.start < end && b.end > start)) booked.add(id);
      }
      setBookedIds(booked);

      const held = new Set<string>();
      const now = Date.now();
      for (const [id, hs] of Object.entries(holdMap)) {
        if (hs.some((h) => h.start < end && h.end > start && h.expiresAt > now)) held.add(id);
      }
      setHeldIds(held);
    } catch {
      // Silently fail — data will load on next event
    }
  }, [spots.length, date, startTime, duration]);

  useEffect(() => { loadData(); }, [loadData]);

  const onWsEvent = useCallback(() => { loadData(); }, [loadData]);
  useWebSocket(garageId ? { type: "subscribe", resourceId: garageId, onEvent: onWsEvent } : null);

  const { start: holdStart, end: holdEnd } = selectedSpot ? getTimeRange() : { start: null, end: null };

  const holdOpts = selectedSpot && holdStart && holdEnd && !confirmed
    ? { resourceId: selectedSpot, start: holdStart, end: holdEnd, onEvent: onWsEvent }
    : null;
  const { connected, confirm } = useHoldWebSocket(holdOpts);

  function handleSelectSpot(id: string) {
    setSelectedSpot(id === selectedSpot ? null : id);
    setConfirmed(false);
  }

  function handleConfirm() {
    if (!selectedSpot) return;
    startTransition(async () => {
      try {
        await confirm();
        setConfirmed(true);
        toast.success("Parking confirmed!");
      } catch (err: any) {
        toast.error(formatError(err.message));
      }
    });
  }

  function handleNewBooking() {
    setSelectedSpot(null);
    setConfirmed(false);
  }

  function prevDay() {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    setDate(toLocalDateString(d));
    setSelectedSpot(null);
    setConfirmed(false);
  }

  function nextDay() {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    setDate(toLocalDateString(d));
    setSelectedSpot(null);
    setConfirmed(false);
  }

  const selectedSpotName = spots.find((s) => s.id === selectedSpot)?.name ?? null;

  return (
    <div className="flex h-full">
      {/* Left controls */}
      <div className="w-64 shrink-0 border-r overflow-auto">
        <div className="p-5 border-b">
          <h2 className="text-sm font-semibold">Downtown Garage</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{spots.length} spots · {floors.length} floors</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Date</Label>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevDay}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setSelectedSpot(null); }} className="text-sm" />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextDay}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <ParkingControls
            selectedSpotName={selectedSpotName}
            duration={duration}
            onDurationChange={(m) => { setDuration(m); setSelectedSpot(null); setConfirmed(false); }}
            startTime={startTime}
            onStartTimeChange={(t) => { setStartTime(t); setSelectedSpot(null); setConfirmed(false); }}
            connected={connected}
            confirmed={confirmed}
            isPending={isPending}
            onConfirm={handleConfirm}
            onNewBooking={handleNewBooking}
            holdStart={holdStart}
            holdEnd={holdEnd}
          />
        </div>
      </div>

      {/* Right: grid with floor tabs */}
      <div className="flex-1 overflow-auto">
        <div className="flex items-center gap-1 border-b px-5 py-2">
          {floors.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFloor(f.name)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                (activeFloorName === f.name)
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50"
              )}
            >
              {f.name}
            </button>
          ))}
        </div>
        <div className="p-5">
          {floorSpots.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              No spots on this floor
            </div>
          ) : (
            <ParkingGrid
              spots={floorSpots}
              availableIds={availableIds}
              bookedIds={bookedIds}
              heldIds={heldIds}
              selectedId={selectedSpot}
              onSelect={handleSelectSpot}
            />
          )}
        </div>
      </div>
    </div>
  );
}
