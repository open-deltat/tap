"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Stage } from "@/components/stage";
import { SeatMap } from "@/components/seat-map";
import { useWebSocket, wsUrl } from "@/hooks/use-websocket";
import { buildSections, allSeatIds } from "@/lib/seat-sections";
import type { Resource, AvailabilitySlot, Booking } from "@/lib/schemas";
import type { Hold } from "@open-tap/client";
import { dayBounds, formatTime } from "@/lib/time";
import { formatError } from "@/lib/format-error";

import { seedLive } from "./seed";
import { getResources } from "@/app/actions/resources";
import { getAvailability, getMultiResourceAvailability } from "@/app/actions/availability";
import { getMultiResourceBookings, bookHeldSeats } from "@/app/actions/bookings";
import { getMultiResourceHolds } from "@/app/actions/holds";

interface SeatState {
  availability: Map<string, AvailabilitySlot[]>;
  bookings: Map<string, Booking[]>;
  holds: Map<string, Hold[]>;
}

const EMPTY_STATE: SeatState = {
  availability: new Map(),
  bookings: new Map(),
  holds: new Map(),
};

/**
 * The same cinema showtime rendered twice. The LEFT pane is a real interactive booker that
 * places deltat HOLDS over a WebSocket (amber) and confirms them via bookHeldSeats; the RIGHT
 * pane is a read-only mirror of the EXACT same venue+slot. Both panes render from one SHARED
 * seat-state object, and both subscribe to the venue: any hold/booking emits a deltat NOTIFY,
 * which re-fetches the shared state — so an action on the left repaints the right within a
 * moment. This is the holds + race-condition + streaming demo, so it must use real holds.
 */
export function LiveRoom() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [slot, setSlot] = useState<{ start: number; end: number } | null>(null);
  const [seatState, setSeatState] = useState<SeatState>(EMPTY_STATE);
  const [selectedSeats, setSelectedSeats] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Per-seat hold WS connections: open WS = hold active on the LEFT pane, close WS = released.
  const holdWsRef = useRef(new Map<string, WebSocket>());

  const venue = resources.find((r) => r.id === venueId) ?? null;
  const sections = useMemo(
    () => (venueId ? buildSections(venueId, resources) : []),
    [venueId, resources]
  );

  function closeAllHolds() {
    for (const ws of holdWsRef.current.values()) ws.close();
    holdWsRef.current.clear();
  }

  // The single source of truth both panes read from. Called on mount and on every NOTIFY.
  const loadSeatState = useCallback(
    async (seatIds: string[], start: number, end: number) => {
      if (seatIds.length === 0) return;
      const [availMap, bookMap, holdMap] = await Promise.all([
        getMultiResourceAvailability(seatIds, start, end),
        getMultiResourceBookings(seatIds),
        getMultiResourceHolds(seatIds),
      ]);
      const availability = new Map(Object.entries(availMap));
      const bookings = new Map<string, Booking[]>();
      for (const [id, bks] of Object.entries(bookMap)) {
        bookings.set(id, (bks as Booking[]).filter((b) => b.start < end && b.end > start));
      }
      const now = Date.now();
      const holds = new Map<string, Hold[]>();
      for (const [id, hs] of Object.entries(holdMap)) {
        holds.set(
          id,
          (hs as Hold[]).filter((h) => h.start < end && h.end > start && h.expiresAt > now)
        );
      }
      setSeatState({ availability, bookings, holds });
    },
    []
  );

  // Seed → resources → single showtime slot → seat state.
  useEffect(() => {
    (async () => {
      try {
        const id = await seedLive();
        const all = await getResources();
        setResources(all);
        setVenueId(id);

        const { dayStart, dayEnd } = dayBounds(new Date());
        const [showtime] = await getAvailability(id, dayStart, dayEnd);
        if (showtime) {
          setSlot({ start: showtime.start, end: showtime.end });
          const seatIds = allSeatIds(buildSections(id, all));
          await loadSeatState(seatIds, showtime.start, showtime.end);
        }
      } catch (err) {
        console.error(err);
        toast.error("Failed to connect to deltat. Is it running?");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => closeAllHolds(), []);

  // Both panes subscribe to the venue. On ANY event, re-read the SHARED seat state — that is how
  // a hold/booking on the left shows up on the right in real time. Skip mid-confirm so an event
  // landing during the booking transition doesn't momentarily re-show just-booked seats as free.
  const reload = useCallback(() => {
    if (isPending || !slot || !venueId) return;
    const seatIds = allSeatIds(buildSections(venueId, resources));
    if (seatIds.length > 0) loadSeatState(seatIds, slot.start, slot.end);
  }, [isPending, slot, venueId, resources, loadSeatState]);

  function handleToggleSeat(seatId: string) {
    if (!slot) return;

    if (selectedSeats.has(seatId)) {
      // Deselect: close WS → server releases the hold; the NOTIFY repaints both panes.
      const ws = holdWsRef.current.get(seatId);
      if (ws) { ws.close(); holdWsRef.current.delete(seatId); }
      setSelectedSeats((prev) => {
        const next = new Set(prev);
        next.delete(seatId);
        return next;
      });
      return;
    }

    // Select: open WS → server places a hold (seat goes amber on the right, green here).
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
        start: slot.start,
        end: slot.end,
      }));
    };
    ws.onerror = revertSelection;
    // The server rejects a hold as a {type:"error"} MESSAGE (not a transport error), so onerror
    // never fires for it. Without this, the optimistic green selection stays even though no hold
    // exists — a phantom-held seat whose later Book then fails.
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

  function handleBookHeld() {
    if (selectedSeats.size === 0 || !slot) return;
    startTransition(async () => {
      try {
        const seatList = Array.from(selectedSeats);
        // bookHeldSeats releases each seat's hold server-side BEFORE booking, so the atomic batch
        // can't conflict with the client's own holds.
        await bookHeldSeats({
          seatIds: seatList,
          start: slot.start,
          end: slot.end,
          label: "Live booking",
        });
        closeAllHolds(); // sockets only — the holds were already released by bookHeldSeats
        setSelectedSeats(new Set());
        const seatIds = allSeatIds(sections);
        await loadSeatState(seatIds, slot.start, slot.end);
      } catch (err) {
        toast.error(formatError(err instanceof Error ? err.message : String(err)));
      }
    });
  }

  // My own holds show as selected (green) on the LEFT, not held (amber). The RIGHT mirror is a
  // second connection, so it sees ALL holds — including mine — as amber.
  const myHeldSeatIds = new Set(holdWsRef.current.keys());
  const otherHolds = useMemo(() => {
    const m = new Map<string, Hold[]>();
    for (const [seatId, hs] of seatState.holds) {
      if (!myHeldSeatIds.has(seatId)) m.set(seatId, hs);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatState.holds, selectedSeats]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0a0a0c] text-zinc-400">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Connecting to deltat…
        </div>
      </div>
    );
  }

  const ribbon = (
    <div className="flex flex-col items-center gap-1.5">
      <div className="text-[11px] text-zinc-500">
        {slot ? `${formatTime(slot.start)} – ${formatTime(slot.end)}` : "No showtime"}
        {selectedSeats.size > 0 && ` · ${selectedSeats.size} held`}
      </div>
      <Button
        size="sm"
        onClick={handleBookHeld}
        disabled={isPending || selectedSeats.size === 0}
        className="h-7 gap-1.5 bg-emerald-500 text-xs text-white hover:bg-emerald-400 disabled:opacity-40"
      >
        Book held seats{selectedSeats.size > 0 && ` (${selectedSeats.size})`}
      </Button>
    </div>
  );

  const noSurface = !slot || sections.length === 0;

  return (
    <Stage
      primitive={{ label: "Realtime · holds + LISTEN/NOTIFY", specId: "PROTO-01" }}
      title="Live Cinema"
      ribbon={ribbon}
    >
      {/* Stacked top/bottom: your booker, then a read-only mirror of the same showtime. */}
      <div className="space-y-3">
        <Pane title="You" hint="tap a free seat to hold it" venueId={venueId} onEvent={reload}>
          {noSurface ? (
            <EmptySurface />
          ) : (
            <SeatMap
              sections={sections}
              availabilityByResource={seatState.availability}
              bookingsByResource={seatState.bookings}
              holdsByResource={otherHolds}
              slotStart={slot.start}
              slotEnd={slot.end}
              selectedIds={selectedSeats}
              onToggle={handleToggleSeat}
              onBookingClick={() => {}}
            />
          )}
        </Pane>

        <Pane title="Another viewer" hint="updates live — not interactive" venueId={venueId} onEvent={reload} mirror>
          {noSurface ? (
            <EmptySurface />
          ) : (
            <SeatMap
              sections={sections}
              availabilityByResource={seatState.availability}
              bookingsByResource={seatState.bookings}
              // The mirror is a different connection: it sees EVERY hold, including yours, as amber.
              holdsByResource={seatState.holds}
              slotStart={slot.start}
              slotEnd={slot.end}
              selectedIds={new Set()}
              onToggle={() => {}}
              onBookingClick={() => {}}
            />
          )}
        </Pane>
      </div>
    </Stage>
  );
}

function EmptySurface() {
  return (
    <div className="py-16 text-center text-sm text-zinc-400">
      No showtime available right now.
    </div>
  );
}

function Pane({
  title,
  hint,
  venueId,
  onEvent,
  mirror = false,
  children,
}: {
  title: string;
  hint: string;
  venueId: string | null;
  onEvent: () => void;
  mirror?: boolean;
  children: ReactNode;
}) {
  // Each pane is its own client: its own venue subscription and its own live pulse. The data it
  // renders is the SHARED seat state (passed down), so when an action lands on either pane, this
  // pane's socket receives the NOTIFY, re-reads the shared state, and the grid repaints under it.
  const [live, setLive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onWsEvent = useCallback(() => {
    onEvent();
    setLive(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLive(false), 700);
  }, [onEvent]);

  useWebSocket(venueId ? { type: "subscribe", resourceId: venueId, onEvent: onWsEvent } : null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.02] p-3 transition-colors",
        mirror ? "border-sky-400/20" : "border-emerald-400/20",
        live && (mirror ? "border-sky-400/50 ring-1 ring-sky-400/30" : "border-emerald-400/50 ring-1 ring-emerald-400/30")
      )}
    >
      {/* One compact header line: identity + read-only tag + live pulse. No text over the grid. */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-medium text-zinc-200">
          <span className={cn("h-2 w-2 rounded-full", mirror ? "bg-sky-400" : "bg-emerald-400")} />
          {title}
          {mirror && (
            <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-1.5 py-px text-[9px] uppercase tracking-wider text-sky-300">
              read-only
            </span>
          )}
          <span className="font-normal text-[10.5px] text-zinc-500">· {hint}</span>
        </span>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider transition-colors",
            live
              ? mirror
                ? "border-sky-400/40 bg-sky-400/15 text-sky-200"
                : "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
              : "border-white/10 text-zinc-500"
          )}
        >
          <Wifi className="h-2.5 w-2.5" />
          {live ? "notify" : "live"}
        </span>
      </div>

      {/* The mirror is non-interactive and dimmed so it reads as "someone else's view". */}
      <div
        className={cn(
          "rounded-lg border border-white/[0.06] bg-white/[0.025] p-3 text-zinc-100",
          mirror && "pointer-events-none select-none opacity-80"
        )}
      >
        {children}
      </div>
    </div>
  );
}
