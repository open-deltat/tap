"use client";

import { useEffect, useState, useCallback, useTransition, useRef } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { BookButton } from "@/components/book-button";
import { SeatMap, type SeatSection } from "@/components/seat-map";
import { CancelBookingDialog } from "@/components/booking-dialog";
import { Stage, type StagePrimitive } from "@/components/stage";
import { BookingConfirmedModal, type BookingResult } from "@/components/booking-confirmed-modal";
import type { Resource, AvailabilitySlot, Booking } from "@/lib/schemas";
import type { Hold } from "@open-tap/client";
import { toLocalDateString, formatTime } from "@/lib/time";
import { buildSections, allSeatIds } from "@/lib/seat-sections";
import { usePersonalCalendar } from "@/components/personal-calendar-provider";
import { useWebSocket, wsUrl } from "@/hooks/use-websocket";

import { getResources } from "@/app/actions/resources";
import { getAvailability } from "@/app/actions/availability";
import { bookHeldSeats, cancelBooking, cancelBookingWithMirror } from "@/app/actions/bookings";
import { getSeatState } from "@/app/actions/seat-state";
import { formatError } from "@/lib/format-error";

export function SeatBookingPage({
  seedFn,
  primitive = { label: "Hold a seat, then book it", specId: "AVAIL-02" },
}: {
  seedFn: () => Promise<string[]>;
  primitive?: StagePrimitive;
}) {
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

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);

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
        const { availability: availMap, bookings: bookMap, holds: holdMap } =
          await getSeatState(seatIds, start, end);
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
    // Don't reload mid-booking: an event arriving during the confirm transition would re-read
    // stale state and momentarily re-show the just-booked seats as free.
    if (isPending) return;
    if (selectedSlot && venueId) {
      const seatIds = allSeatIds(buildSections(venueId, resources));
      if (seatIds.length > 0) loadSeatData(seatIds, selectedSlot.start, selectedSlot.end);
    }
  }, [selectedSlot, venueId, resources, loadSeatData, isPending]);
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
        toast.error("Failed to connect to Δt. Is it running?");
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
      const revertSelection = () => {
        holdWsRef.current.delete(seatId);
        setSelectedSeats((prev) => {
          const next = new Set(prev);
          next.delete(seatId);
          return next;
        });
      };
      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: "hold",
          resourceId: seatId,
          start: selectedSlot.start,
          end: selectedSlot.end,
        }));
      };
      ws.onerror = revertSelection;
      // The server rejects a hold as a {type:"error"} MESSAGE (not a transport error), so
      // onerror never fires for it. Without this, the optimistic green selection stays even
      // though no hold exists — a phantom-held seat whose later Book then fails.
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data));
          if (data?.type === "error") {
            ws.close();
            revertSelection();
            toast.error("That seat was just taken");
          }
        } catch {
          // non-JSON / deltat event frame — ignore
        }
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
        const seatList = Array.from(selectedSeats);
        const bookedResources = resources.filter((r) => selectedSeats.has(r.id));
        const slotStart = selectedSlot.start;
        const slotEnd = selectedSlot.end;
        const calendar = calendarId
          ? {
              resourceId: calendarId,
              label: `${venue?.name ?? "Booking"} ${seatList.map(seatName).sort().join(", ")}`.trim(),
            }
          : undefined;
        // bookHeldSeats releases each seat's hold server-side BEFORE booking, so the atomic
        // batch can't conflict with the client's own holds. The prior closeAllHolds()+book
        // raced the unawaited socket-close release and intermittently lost the whole booking.
        const created = await bookHeldSeats({
          seatIds: seatList,
          start: slotStart,
          end: slotEnd,
          label: venue?.name ?? "Booking",
          calendar,
        });
        closeAllHolds(); // sockets only — the holds were already released by bookHeldSeats
        setSelectedSeats(new Set());
        // Success → the shared modal: human receipt + the verbatim deltat rows.
        setBookingResult({
          title: `${seatList.length} seat${seatList.length > 1 ? "s" : ""} · ${venue?.name ?? "Booking"}`,
          subtitle: `${formatTime(slotStart)} to ${formatTime(slotEnd)}`,
          bookings: created,
          resources: bookedResources,
        });
        const seatIds = allSeatIds(sections);
        await loadSeatData(seatIds, slotStart, slotEnd);
      } catch (err) {
        toast.error(formatError(err instanceof Error ? err.message : String(err)));
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
      } catch (err) {
        toast.error(formatError(err instanceof Error ? err.message : String(err)));
      }
    });
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
      <div className="flex h-full items-center justify-center bg-[#0a0a0c] text-zinc-400">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Connecting to Δt…
        </div>
      </div>
    );
  }

  // Selectors live in context, right above the seat map they filter — not stranded at the top.
  const controls =
    venues.length > 1 || venueSlots.length > 1 ? (
      <div className="mb-5 flex flex-col items-center gap-2">
        {venues.length > 1 && (
          <Segmented
            items={venues.map((r) => ({ value: r.id, label: r.name ?? "Venue" }))}
            value={venueId}
            onChange={(v) => setVenueId(v)}
            ariaLabel="Venue"
          />
        )}
        {venueSlots.length > 1 && (
          <Segmented
            items={venueSlots.map((s) => ({ value: s.start, label: formatTime(s.start) }))}
            value={selectedSlot?.start ?? null}
            onChange={(start) => {
              const slot = venueSlots.find((s) => s.start === start);
              if (slot) setSelectedSlot({ start: slot.start, end: slot.end });
            }}
            ariaLabel="Showtime"
          />
        )}
      </div>
    ) : null;

  const bookingTray =
    selectedSeats.size > 0 && selectedSlot ? (
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {Array.from(selectedSeats)
            .map((id) => ({ id, name: seatName(id), price: getSeatSection(id)?.price }))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(({ id, name, price }) => (
              <span
                key={id}
                className="rounded bg-emerald-400/15 px-1.5 py-0.5 text-xs font-medium text-emerald-200"
              >
                {name}
                {price != null && <span className="ml-0.5 text-emerald-300/70">${price}</span>}
              </span>
            ))}
        </div>
        <BookButton onClick={handleBookSelected} loading={isPending}>
          Book {selectedSeats.size}
          {selectedTotal > 0 && ` · $${selectedTotal.toLocaleString()}`}
        </BookButton>
      </div>
    ) : undefined;

  const surface =
    !venueId || venueSlots.length === 0 ? (
      <div className="py-16 text-center text-sm text-zinc-400">No availability right now.</div>
    ) : !selectedSlot || sections.length === 0 ? (
      <div className="py-16 text-center text-sm text-zinc-400">Loading seats…</div>
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
    );

  return (
    <>
      <Stage primitive={primitive} title={venue?.name ?? undefined} tray={bookingTray}>
        {controls}
        {surface}
      </Stage>

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

      <BookingConfirmedModal
        result={bookingResult}
        onClose={() => setBookingResult(null)}
        onBookAnother={() => setBookingResult(null)}
      />

      {isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Working…
          </div>
        </div>
      )}
    </>
  );
}
