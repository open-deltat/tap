"use client";

import { useEffect, useState, useCallback, useTransition, useRef } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SeatMap, type SeatSection } from "@/components/seat-map";
import { CancelBookingDialog } from "@/components/booking-dialog";
import type { Resource, AvailabilitySlot, Booking } from "@/lib/schemas";
import type { Hold } from "@open-tap/client";
import { toLocalDateString, formatTime } from "@/lib/time";
import { buildSections, allSeatIds } from "@/lib/seat-sections";
import { usePersonalCalendar } from "@/components/personal-calendar-provider";
import { useWebSocket, wsUrl } from "@/hooks/use-websocket";

import { getResources } from "@/app/actions/resources";
import { getAvailability, getMultiResourceAvailability } from "@/app/actions/availability";
import { getMultiResourceBookings, batchBookSlots, cancelBooking, cancelBookingWithMirror } from "@/app/actions/bookings";
import { getMultiResourceHolds } from "@/app/actions/holds";
import { formatError } from "@/lib/format-error";

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function SeatBookingPage({ seedFn }: { seedFn: () => Promise<string[]> }) {
  const { calendarId } = usePersonalCalendar();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const [venueIds, setVenueIds] = useState<string[]>([]);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [date, setDate] = useState(toLocalDateString(new Date()));

  const [venueSlots, setVenueSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<{ start: number; end: number } | null>(null);

  const [availability, setAvailability] = useState<Map<string, AvailabilitySlot[]>>(new Map());
  const [bookings, setBookings] = useState<Map<string, Booking[]>>(new Map());
  const [holds, setHolds] = useState<Map<string, Hold[]>>(new Map());
  const [selectedSeats, setSelectedSeats] = useState<Set<string>>(new Set());
  const [bookingLabel, setBookingLabel] = useState("");

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);

  // Per-seat hold WS connections: open WS = hold active, close WS = hold released
  const holdWsRef = useRef(new Map<string, WebSocket>());

  const venue = resources.find((r) => r.id === venueId) ?? null;
  const sections = venueId ? buildSections(venueId, resources) : [];
  const venues = resources.filter((r) => venueIds.includes(r.id));

  function closeAllHolds() {
    for (const ws of holdWsRef.current.values()) ws.close();
    holdWsRef.current.clear();
  }

  // Load venue availability when venue/date changes
  useEffect(() => {
    if (!venueId || !date) return;
    const dayStart = new Date(`${date}T00:00`).getTime();
    if (isNaN(dayStart)) return;
    const dayEnd = dayStart + 86_400_000;

    getAvailability(venueId, dayStart, dayEnd)
      .then((slots) => {
        setVenueSlots(slots);
        setSelectedSlot(slots.length > 0 ? { start: slots[0].start, end: slots[0].end } : null);
        setAvailability(new Map());
        setBookings(new Map());
        setHolds(new Map());
        closeAllHolds();
        setSelectedSeats(new Set());
      })
      .catch((err) => {
        console.error("Failed to get venue availability:", err);
        setVenueSlots([]);
      });
  }, [venueId, date, resources]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load seat data (availability, bookings, holds) for a time range
  const loadSeatData = useCallback(
    async (seatIds: string[], start: number, end: number) => {
      if (seatIds.length === 0) return;
      try {
        const [availMap, bookMap, holdMap] = await Promise.all([
          getMultiResourceAvailability(seatIds, start, end),
          getMultiResourceBookings(seatIds),
          getMultiResourceHolds(seatIds),
        ]);
        setAvailability(new Map(Object.entries(availMap)));
        const filteredBookings = new Map<string, Booking[]>();
        for (const [id, bks] of Object.entries(bookMap)) {
          filteredBookings.set(id, (bks as Booking[]).filter((b) => b.start < end && b.end > start));
        }
        setBookings(filteredBookings);
        const now = Date.now();
        const filteredHolds = new Map<string, Hold[]>();
        for (const [id, hs] of Object.entries(holdMap)) {
          filteredHolds.set(
            id,
            (hs as Hold[]).filter((h) => h.start < end && h.end > start && h.expiresAt > now)
          );
        }
        setHolds(filteredHolds);
      } catch (err) {
        console.error("Failed to load seat data:", err);
        toast.error("Failed to load seat data");
      }
    },
    []
  );

  // Reload seat data when slot changes
  useEffect(() => {
    if (!selectedSlot || !venueId) return;
    const seatIds = allSeatIds(buildSections(venueId, resources));
    if (seatIds.length === 0) return;
    loadSeatData(seatIds, selectedSlot.start, selectedSlot.end);
    closeAllHolds();
    setSelectedSeats(new Set());
  }, [selectedSlot]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup hold connections on unmount
  useEffect(() => {
    return () => closeAllHolds();
  }, []);

  // Real-time updates via WebSocket (venue-level subscription)
  const onWsEvent = useCallback(() => {
    if (selectedSlot && venueId) {
      const seatIds = allSeatIds(buildSections(venueId, resources));
      if (seatIds.length > 0) loadSeatData(seatIds, selectedSlot.start, selectedSlot.end);
    }
  }, [selectedSlot, venueId, resources, loadSeatData]);
  useWebSocket(venueId ? { type: "subscribe", resourceId: venueId, onEvent: onWsEvent } : null);

  // Seed on mount
  useEffect(() => {
    async function init() {
      try {
        const ids = await seedFn();
        const all = await getResources();
        setResources(all);
        setVenueIds(ids);
        if (ids.length > 0) setVenueId(ids[0]);
      } catch (err) {
        console.error("Failed to seed:", err);
        toast.error("Failed to connect to deltat. Is it running?");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleToggleSeat(seatId: string) {
    if (!selectedSlot) return;

    if (selectedSeats.has(seatId)) {
      // Deselect: close WS → server releases hold
      const ws = holdWsRef.current.get(seatId);
      if (ws) { ws.close(); holdWsRef.current.delete(seatId); }
      setSelectedSeats((prev) => {
        const next = new Set(prev);
        next.delete(seatId);
        return next;
      });
    } else {
      // Select: open WS → server places hold
      const ws = new WebSocket(wsUrl());
      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: "hold",
          resourceId: seatId,
          start: selectedSlot.start,
          end: selectedSlot.end,
        }));
      };
      ws.onerror = () => {
        holdWsRef.current.delete(seatId);
        setSelectedSeats((prev) => {
          const next = new Set(prev);
          next.delete(seatId);
          return next;
        });
      };
      holdWsRef.current.set(seatId, ws);
      setSelectedSeats((prev) => new Set(prev).add(seatId));
    }
  }

  function getSeatSection(seatId: string): SeatSection | undefined {
    return sections.find((s) => s.seats.some((seat) => seat.id === seatId));
  }

  const selectedTotal = Array.from(selectedSeats).reduce((sum, seatId) => {
    const section = getSeatSection(seatId);
    return sum + (section?.price ?? 0);
  }, 0);

  async function handleBookSelected() {
    if (selectedSeats.size === 0 || !selectedSlot) return;
    startTransition(async () => {
      try {
        // Close hold connections → releases holds on server
        closeAllHolds();

        const seatList = Array.from(selectedSeats);
        const slots = seatList.map((seatId) => ({
          resourceId: seatId,
          start: selectedSlot.start,
          end: selectedSlot.end,
          label: bookingLabel,
        }));
        if (calendarId) {
          const names = seatList.map(seatName).sort().join(", ");
          slots.push({
            resourceId: calendarId,
            start: selectedSlot.start,
            end: selectedSlot.end,
            label: `${venue?.name ?? "Booking"} ${names}`.trim(),
          });
        }
        await batchBookSlots(slots);
        toast.success(`Booked ${seatList.length} seat${seatList.length > 1 ? "s" : ""}`);
        setSelectedSeats(new Set());
        setBookingLabel("");
        const seatIds = allSeatIds(sections);
        await loadSeatData(seatIds, selectedSlot.start, selectedSlot.end);
      } catch (err: any) {
        toast.error(formatError(err.message) ?? "Booking failed — seats may be taken");
      }
    });
  }

  function handleBookingClick(booking: Booking) {
    setCancelTarget(booking);
    setCancelDialogOpen(true);
  }

  async function handleCancelConfirm() {
    if (!cancelTarget || !selectedSlot) return;
    setCancelDialogOpen(false);
    startTransition(async () => {
      try {
        if (calendarId) {
          await cancelBookingWithMirror(cancelTarget.id, calendarId, cancelTarget.start, cancelTarget.end);
        } else {
          await cancelBooking(cancelTarget.id);
        }
        toast.success("Booking cancelled");
        const seatIds = allSeatIds(sections);
        await loadSeatData(seatIds, selectedSlot.start, selectedSlot.end);
      } catch (err: any) {
        toast.error(formatError(err.message) ?? "Failed to cancel booking");
      }
    });
  }

  function prevDay() {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    setDate(toLocalDateString(d));
  }

  function nextDay() {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    setDate(toLocalDateString(d));
  }

  function seatName(seatId: string): string {
    for (const s of sections) {
      const seat = s.seats.find((x) => x.id === seatId);
      if (seat) return seat.name;
    }
    return seatId;
  }

  // Filter out my holds so they show as selected (green) not held (amber)
  const myHeldSeatIds = new Set(holdWsRef.current.keys());
  const otherHolds = new Map<string, Hold[]>();
  for (const [seatId, seatHolds] of holds) {
    if (!myHeldSeatIds.has(seatId)) {
      otherHolds.set(seatId, seatHolds);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Connecting to deltat...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Venue selector (only shown if multiple venues) */}
      {venues.length > 1 && (
        <div className="flex items-center gap-2 border-b px-6 py-3">
          {venues.map((r) => (
            <Button
              key={r.id}
              variant={r.id === venueId ? "default" : "outline"}
              size="sm"
              onClick={() => setVenueId(r.id)}
            >
              {r.name}
            </Button>
          ))}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div className="w-64 shrink-0 border-r flex flex-col">
          <div className="p-4 space-y-4 border-b">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Date</Label>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevDay}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="text-sm"
                />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextDay}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {venue && (
              <div className="rounded-md bg-muted/50 p-3 text-xs space-y-0.5">
                <div className="font-medium text-foreground">{venue.name}</div>
                <div className="text-muted-foreground">
                  {formatDuration(venue.slotMinutes)} per slot
                  {venue.bufferMinutes > 0 && ` · ${venue.bufferMinutes}m buffer`}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-auto p-4 space-y-2">
            <Label className="text-xs font-medium">
              {venueSlots.length > 0
                ? `${venueSlots.length} Available Time${venueSlots.length > 1 ? "s" : ""}`
                : "Available Times"}
            </Label>

            {venueSlots.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center">
                <div className="text-xs text-muted-foreground">No availability on this date</div>
                <div className="text-[10px] text-muted-foreground/70 mt-1">Try another date</div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {venueSlots.map((slot, i) => {
                  const isActive =
                    selectedSlot?.start === slot.start && selectedSlot?.end === slot.end;
                  const durMin = Math.round((slot.end - slot.start) / 60_000);
                  return (
                    <button
                      key={i}
                      className={cn(
                        "w-full rounded-md border px-3 py-2.5 text-left transition-all",
                        isActive
                          ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-200"
                          : "border-border hover:border-emerald-300 hover:bg-emerald-50/50"
                      )}
                      onClick={() =>
                        setSelectedSlot(isActive ? null : { start: slot.start, end: slot.end })
                      }
                    >
                      <div className="text-sm font-semibold">{formatTime(slot.start)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatTime(slot.start)} – {formatTime(slot.end)} · {formatDuration(durMin)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedSeats.size > 0 && selectedSlot && (
            <div className="border-t p-4 space-y-3">
              <div className="text-sm font-medium">
                {selectedSeats.size} seat{selectedSeats.size > 1 ? "s" : ""} selected
              </div>
              <div className="flex flex-wrap gap-1">
                {Array.from(selectedSeats)
                  .map((id) => ({
                    id,
                    name: seatName(id),
                    price: getSeatSection(id)?.price,
                  }))
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(({ id, name, price }) => (
                    <span
                      key={id}
                      className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700"
                    >
                      {name}
                      {price !== null && price !== undefined && (
                        <span className="ml-0.5 text-emerald-500">${price}</span>
                      )}
                    </span>
                  ))}
              </div>
              {selectedTotal > 0 && (
                <div className="text-sm font-semibold">Total: ${selectedTotal.toLocaleString()}</div>
              )}
              <div className="space-y-2">
                <Label htmlFor="seat-label" className="text-xs">Label (optional)</Label>
                <Input
                  id="seat-label"
                  placeholder="e.g. John Smith"
                  value={bookingLabel}
                  onChange={(e) => setBookingLabel(e.target.value)}
                  className="text-sm"
                />
              </div>
              <Button className="w-full" onClick={handleBookSelected} disabled={isPending}>
                Book {selectedSeats.size} Seat{selectedSeats.size > 1 ? "s" : ""}
                {selectedTotal > 0 && ` · $${selectedTotal.toLocaleString()}`}
              </Button>
            </div>
          )}
        </div>

        {/* Right: seat map */}
        <div className="flex-1 flex items-center justify-center overflow-auto p-8">
          {!venueId ? (
            <div className="text-sm text-muted-foreground">Select a venue to view its seat map</div>
          ) : venueSlots.length === 0 ? (
            <div className="text-center space-y-2">
              <div className="text-sm text-muted-foreground">No availability on this date</div>
              <div className="text-xs text-muted-foreground/70">
                {venue?.name} has no scheduled events for{" "}
                {new Date(date + "T00:00").toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </div>
            </div>
          ) : !selectedSlot ? (
            <div className="text-center space-y-2">
              <div className="text-sm text-muted-foreground">
                Select a time slot to view available seats
              </div>
              <div className="text-xs text-muted-foreground/70">
                {venueSlots.length} time{venueSlots.length > 1 ? "s" : ""} available — pick one from
                the left
              </div>
            </div>
          ) : sections.length === 0 ? (
            <div className="text-sm text-muted-foreground">No seats found for this venue</div>
          ) : (
            <SeatMap
              sections={sections}
              availabilityByResource={availability}
              bookingsByResource={bookings}
              holdsByResource={otherHolds}
              slotStart={selectedSlot.start}
              slotEnd={selectedSlot.end}
              selectedIds={selectedSeats}
              onToggle={handleToggleSeat}
              onBookingClick={handleBookingClick}
            />
          )}
        </div>
      </div>

      {cancelTarget && (
        <CancelBookingDialog
          open={cancelDialogOpen}
          onOpenChange={setCancelDialogOpen}
          resourceName={seatName(cancelTarget.resourceId)}
          start={cancelTarget.start}
          end={cancelTarget.end}
          onConfirm={handleCancelConfirm}
        />
      )}

      {isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Working...
          </div>
        </div>
      )}
    </div>
  );
}
