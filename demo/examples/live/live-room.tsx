"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2, Wifi } from "lucide-react";
import { BookButton } from "@/components/book-button";
import { BookingConfirmedModal, type BookingResult } from "@/components/booking-confirmed-modal";
import { cn } from "@/lib/utils";
import { Stage } from "@/components/stage";
import { SeatMap } from "@/components/seat-map";
import { useWebSocket, wsUrl, type StreamStatus } from "@/hooks/use-websocket";
import { buildSections, allSeatIds } from "@/lib/seat-sections";
import type { Resource, AvailabilitySlot, Booking } from "@/lib/schemas";
import type { Hold } from "@open-deltat/client";
import { dayBounds, formatTime } from "@/lib/time";
import { formatError } from "@/lib/format-error";

import { seedLive } from "./seed";
import { getResources } from "@/app/actions/resources";
import { getAvailability } from "@/app/actions/availability";
import { bookHeldSeats } from "@/app/actions/bookings";
import { getSeatState } from "@/app/actions/seat-state";

type Sections = ReturnType<typeof buildSections>;

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

const ACCENT = {
  emerald: {
    border: "border-emerald-400/20",
    borderLive: "border-emerald-400/50 ring-1 ring-emerald-400/30",
    dot: "bg-emerald-400",
    pulseOn: "border-emerald-400/40 bg-emerald-400/15 text-emerald-200",
  },
  sky: {
    border: "border-sky-400/20",
    borderLive: "border-sky-400/50 ring-1 ring-sky-400/30",
    dot: "bg-sky-400",
    pulseOn: "border-sky-400/40 bg-sky-400/15 text-sky-200",
  },
} as const;
type Accent = keyof typeof ACCENT;

/**
 * The same cinema showtime rendered as TWO independent bookers: "You" and "Viewer 1". Each is a
 * fully separate client instance: its own venue subscription, its own seat-state read, its own
 * holds (open WS = hold, close = release) and its own atomic booking. Neither is read-only.
 *
 * Because both subscribe to the venue, any hold/booking on one emits a deltat NOTIFY that the other
 * re-reads from, so the other's holds show up amber within a moment, and if both grab the very same
 * seat the loser's hold is rejected. This is the holds + race-condition + streaming demo in its
 * truest form: two real users racing on one source of truth.
 */
export function LiveRoom() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [slot, setSlot] = useState<{ start: number; end: number } | null>(null);
  const [loading, setLoading] = useState(true);

  // The server pauses idle streams (DoS guard). Either booker can report the stream status; bumping
  // streamKey remounts BOTH so "keep watching" reopens them with a fresh server clock.
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("connecting");
  const [streamKey, setStreamKey] = useState(0);

  const sections = useMemo(
    () => (venueId ? buildSections(venueId, resources) : []),
    [venueId, resources]
  );

  // Seed → resources → single showtime slot. Both bookers read their own seat state from there.
  useEffect(() => {
    (async () => {
      try {
        const id = await seedLive();
        const all = await getResources();
        setResources(all);
        setVenueId(id);

        const { dayStart, dayEnd } = dayBounds(new Date());
        const [showtime] = await getAvailability(id, dayStart, dayEnd);
        if (showtime) setSlot({ start: showtime.start, end: showtime.end });
      } catch (err) {
        console.error(err);
        toast.error("Failed to connect to Δt. Is it running?");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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

  return (
    <Stage
      primitive={{ label: "Holds that update live for everyone", specId: "PROTO-01" }}
      title="Live Cinema"
      contentMax="max-w-none"
    >
      <div className="space-y-3">
        {(streamStatus === "expiring" || streamStatus === "paused") && (
          <StreamNotice status={streamStatus} onResume={() => setStreamKey((k) => k + 1)} />
        )}
        {/* Two independent bookers: side-by-side on desktop, stacked top/bottom on mobile. */}
        <div key={streamKey} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Booker
            label="You"
            accent="emerald"
            venueId={venueId}
            slot={slot}
            sections={sections}
            resources={resources}
            onStatus={setStreamStatus}
          />
          <Booker label="Viewer 1" accent="sky" venueId={venueId} slot={slot} sections={sections} resources={resources} />
        </div>
      </div>
    </Stage>
  );
}

/** A self-contained booker: its own seat-state read, holds, selection, atomic booking and socket. */
function Booker({
  label,
  accent,
  venueId,
  slot,
  sections,
  resources,
  onStatus,
}: {
  label: string;
  accent: Accent;
  venueId: string | null;
  slot: { start: number; end: number } | null;
  sections: Sections;
  resources: Resource[];
  onStatus?: (s: StreamStatus) => void;
}) {
  const [seatState, setSeatState] = useState<SeatState>(EMPTY_STATE);
  const [selectedSeats, setSelectedSeats] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BookingResult | null>(null);
  const [perf, setPerf] = useState<{ read?: number; book?: number; live?: number }>({});
  const [live, setLive] = useState(false);

  const holdSentAt = useRef<number | null>(null);
  const holdWsRef = useRef(new Map<string, WebSocket>());
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const seatIds = useMemo(() => allSeatIds(sections), [sections]);
  const a = ACCENT[accent];

  function closeAllHolds() {
    for (const ws of holdWsRef.current.values()) ws.close();
    holdWsRef.current.clear();
  }

  const loadSeatState = useCallback(async () => {
    if (!slot || seatIds.length === 0) return;
    const t0 = performance.now();
    const { availability: availMap, bookings: bookMap, holds: holdMap } = await getSeatState(
      seatIds,
      slot.start,
      slot.end
    );
    const availability = new Map(Object.entries(availMap));
    const bookings = new Map<string, Booking[]>();
    for (const [id, bks] of Object.entries(bookMap)) {
      bookings.set(id, (bks as Booking[]).filter((b) => b.start < slot.end && b.end > slot.start));
    }
    const now = Date.now();
    const holds = new Map<string, Hold[]>();
    for (const [id, hs] of Object.entries(holdMap)) {
      holds.set(id, (hs as Hold[]).filter((h) => h.start < slot.end && h.end > slot.start && h.expiresAt > now));
    }
    setSeatState({ availability, bookings, holds });
    setPerf((p) => ({ ...p, read: performance.now() - t0 }));
  }, [slot, seatIds]);

  useEffect(() => { loadSeatState(); }, [loadSeatState]);
  useEffect(() => () => { closeAllHolds(); }, []);
  useEffect(() => () => { if (pulseTimer.current) clearTimeout(pulseTimer.current); }, []);

  // On any NOTIFY, re-read my own seat state (this is how the other booker's holds appear here).
  const reload = useCallback(() => {
    if (isPending) return;
    const sent = holdSentAt.current;
    if (sent != null) {
      holdSentAt.current = null;
      setPerf((p) => ({ ...p, live: performance.now() - sent }));
    }
    loadSeatState();
  }, [isPending, loadSeatState]);

  const onWsEvent = useCallback(() => {
    reload();
    setLive(true);
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => setLive(false), 700);
  }, [reload]);

  const { status } = useWebSocket(venueId ? { type: "subscribe", resourceId: venueId, onEvent: onWsEvent } : null);
  useEffect(() => { onStatus?.(status); }, [status, onStatus]);

  function handleToggleSeat(seatId: string) {
    if (!slot) return;

    if (selectedSeats.has(seatId)) {
      const ws = holdWsRef.current.get(seatId);
      if (ws) { ws.close(); holdWsRef.current.delete(seatId); }
      setSelectedSeats((prev) => { const next = new Set(prev); next.delete(seatId); return next; });
      return;
    }

    const ws = new WebSocket(wsUrl());
    const revert = () => {
      holdWsRef.current.delete(seatId);
      setSelectedSeats((prev) => { const next = new Set(prev); next.delete(seatId); return next; });
    };
    ws.onopen = () => {
      holdSentAt.current = performance.now();
      ws.send(JSON.stringify({ type: "hold", resourceId: seatId, start: slot.start, end: slot.end }));
    };
    ws.onerror = revert;
    // The server rejects a hold with a {type:"error"} MESSAGE (not a transport error), so onerror
    // never fires, without this the optimistic selection sticks on a seat that's actually taken.
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data));
        if (data?.type === "error") {
          ws.close();
          revert();
          toast.error("That seat was just taken");
        }
      } catch {
        // deltat event frame / non-JSON, ignore
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
        const venue = resources.find((r) => r.id === venueId);
        const bookedResources = resources.filter((r) => selectedSeats.has(r.id));
        const t0 = performance.now();
        const created = await bookHeldSeats({
          seatIds: seatList,
          start: slot.start,
          end: slot.end,
          label: venue?.name ?? "Live booking",
        });
        setPerf((p) => ({ ...p, book: performance.now() - t0 }));
        closeAllHolds();
        setSelectedSeats(new Set());
        setResult({
          title: `${seatList.length} seat${seatList.length > 1 ? "s" : ""} · ${label}`,
          subtitle: `${formatTime(slot.start)} to ${formatTime(slot.end)}`,
          bookings: created,
          resources: bookedResources,
        });
        loadSeatState();
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
  const sectionOf = (seatId: string) => sections.find((s) => s.seats.some((x) => x.id === seatId));
  const selectedTotal = Array.from(selectedSeats).reduce((sum, id) => sum + (sectionOf(id)?.price ?? 0), 0);

  // My own holds render as selected (green) here; the OTHER booker's holds render amber.
  const myHeld = new Set(holdWsRef.current.keys());
  const otherHolds = useMemo(() => {
    const m = new Map<string, Hold[]>();
    for (const [seatId, hs] of seatState.holds) if (!myHeld.has(seatId)) m.set(seatId, hs);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatState.holds, selectedSeats]);

  const noSurface = !slot || sections.length === 0;

  return (
    <>
      <div className={cn("rounded-xl border bg-white/[0.02] p-2 transition-colors sm:p-3", a.border, live && a.borderLive)}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-xs font-medium text-zinc-200">
            <span className={cn("h-2 w-2 rounded-full", a.dot)} />
            {label}
            {slot && (
              <span className="font-normal text-[10.5px] text-zinc-500">
                · {formatTime(slot.start)}–{formatTime(slot.end)} · tap a free seat to hold it
              </span>
            )}
          </span>
          <span
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider transition-colors",
              live ? a.pulseOn : "border-white/10 text-zinc-500"
            )}
          >
            <Wifi className="h-2.5 w-2.5" />
            <span className="inline-block w-[2.75rem] text-center">{live ? "notify" : "live"}</span>
          </span>
        </div>

        <PerfBar perf={perf} />

        <div className="mt-2 rounded-lg border-0 bg-transparent p-0 text-zinc-100 sm:border sm:border-white/[0.06] sm:bg-white/[0.025] sm:p-3">
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
        </div>

        {/* Always reserved so selecting a seat never grows the card. Empty state holds the space. */}
        <div className="mt-2 flex min-h-[2.5rem] flex-wrap items-center gap-2 border-t border-white/[0.06] pt-2">
          {slot && selectedSeats.size > 0 ? (
            <>
              <div className="flex flex-1 flex-wrap items-center gap-1.5">
                {Array.from(selectedSeats)
                  .map((id) => ({ id, name: seatName(id), price: sectionOf(id)?.price }))
                  .sort((x, y) => x.name.localeCompare(y.name))
                  .map(({ id, name, price }) => (
                    <span key={id} className="rounded bg-emerald-400/15 px-1.5 py-0.5 text-xs font-medium text-emerald-200">
                      {name}
                      {price != null && <span className="ml-0.5 text-emerald-300/70">${price}</span>}
                    </span>
                  ))}
              </div>
              <BookButton onClick={handleBookHeld} loading={isPending}>
                Book {selectedSeats.size}
                {selectedTotal > 0 && ` · $${selectedTotal.toLocaleString()}`}
              </BookButton>
            </>
          ) : (
            <span className="text-[11px] text-zinc-600">Tap a free seat to hold it, then book.</span>
          )}
        </div>
      </div>

      <BookingConfirmedModal result={result} onClose={() => setResult(null)} onBookAnother={() => setResult(null)} />
    </>
  );
}

function EmptySurface() {
  return <div className="py-16 text-center text-sm text-zinc-400">No showtime available right now.</div>;
}

function fmtMs(n: number): string {
  return (n < 10 ? n.toFixed(1) : String(Math.round(n))) + " ms";
}

/** Real round-trip timings to Δt for this client: a read, the hold→broadcast loop, and a booking. */
function PerfBar({ perf }: { perf: { read?: number; book?: number; live?: number } }) {
  const stats: { label: string; hint: string; value?: number }[] = [
    { label: "read", hint: "availability + holds", value: perf.read },
    { label: "live", hint: "hold to broadcast", value: perf.live },
    { label: "book", hint: "atomic batch", value: perf.book },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {stats.map((s) => (
        <span
          key={s.label}
          className="flex items-baseline gap-1 rounded-md border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5"
          title={s.hint}
        >
          <span className="text-[9px] text-zinc-500">{s.label}</span>
          <span className="inline-block min-w-[3rem] text-right font-mono text-[10px] font-semibold tabular-nums text-emerald-300">
            {s.value != null ? fmtMs(s.value) : "n/a"}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Server-driven stream-lifetime notice + one-tap resume (remounts both bookers). */
function StreamNotice({ status, onResume }: { status: StreamStatus; onResume: () => void }) {
  const expiring = status === "expiring";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-xl border px-3 py-2 text-sm",
        expiring ? "border-amber-400/40 bg-amber-400/10 text-amber-200" : "border-white/15 bg-white/[0.03] text-zinc-300"
      )}
    >
      <span>{expiring ? "Live updates pause soon to keep the demo fast." : "Live updates paused."}</span>
      <button
        type="button"
        onClick={onResume}
        className="rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-500/25"
      >
        {expiring ? "Keep watching" : "Resume"}
      </button>
    </div>
  );
}
