"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2, Wifi } from "lucide-react";
import { BookButton } from "../../components/book-button";
import { BookingConfirmedModal, type BookingResult } from "../../components/booking-confirmed-modal";
import { cn } from "@open-deltat/shared/utils";
import { Stage } from "../../components/stage";
import { SeatMap } from "../../components/seat-map";
import { useWebSocket, wsUrl, type StreamStatus } from "../../hooks/use-websocket";
import { buildSections, allSeatIds } from "../../lib/seat-sections";
import type { Resource, AvailabilitySlot, Booking } from "../../lib/schemas";
import type { Hold } from "@open-deltat/client";
import { dayBounds, formatTime } from "@open-deltat/shared/time";
import { formatError } from "../../lib/format-error";

import { seedLive } from "./seed";
import { getResources } from "../../actions/resources";
import { getAvailability } from "../../actions/availability";
import { bookHeldSeats } from "../../actions/bookings";
import { getSeatState } from "../../actions/seat-state";

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

// Who each panel is: you in ink (the selection colour), the other person in a quieter grey.
const PERSON = {
  you: "bg-dt-ink",
  other: "bg-dt-ink-3",
} as const;
type Person = keyof typeof PERSON;

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
      <div className="dt-canvas flex h-full items-center justify-center text-dt-ink-3">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Connecting to Δt…
        </div>
      </div>
    );
  }

  return (
    <Stage
      primitive={{ label: "Two screens, one cinema. Hold a seat on one and watch it change on the other.", specId: "PROTO-01" }}
      title="Live cinema"
      contentMax="max-w-[1400px]"
    >
      <div className="space-y-4">
        {(streamStatus === "expiring" || streamStatus === "paused") && (
          <StreamNotice status={streamStatus} onResume={() => setStreamKey((k) => k + 1)} />
        )}
        {/* Two independent bookers on the one surface, parted by a hairline: beside each other on
            desktop, one above the other on a phone. */}
        <div key={streamKey} className="grid grid-cols-1 divide-y divide-dt-line lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <Booker
            label="You"
            person="you"
            venueId={venueId}
            slot={slot}
            sections={sections}
            resources={resources}
            onStatus={setStreamStatus}
          />
          <Booker label="Someone else" person="other" venueId={venueId} slot={slot} sections={sections} resources={resources} />
        </div>
      </div>
    </Stage>
  );
}

/** A self-contained booker: its own seat-state read, holds, selection, atomic booking and socket. */
function Booker({
  label,
  person,
  venueId,
  slot,
  sections,
  resources,
  onStatus,
}: {
  label: string;
  person: Person;
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

  const { status } = useWebSocket(venueId ? { type: "subscribe", resourceId: venueId, onChange: onWsEvent } : null);
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
      {/* No box of its own: the Stage surface is the card. A notify from the other screen lights the
          Live pill for a moment, which is the only thing that changes. */}
      <div className="py-5 first:pt-0 last:pb-0 lg:px-6 lg:py-0 lg:first:pl-0 lg:last:pr-0">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-dt-ink">
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", PERSON[person])} />
              {label}
            </div>
            {slot && (
              <div className="mt-0.5 text-[12.5px] tabular-nums text-dt-ink-3">
                Showtime {formatTime(slot.start)} to {formatTime(slot.end)}
              </div>
            )}
          </div>
          <span
            className={cn(
              "flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition-colors duration-300",
              live ? "bg-dt-accent-soft text-dt-accent-ink" : "bg-dt-sunken text-dt-ink-3"
            )}
          >
            <Wifi className="h-3.5 w-3.5" />
            <span className="inline-block w-[3.6rem] text-center">{live ? "Updated" : "Live"}</span>
          </span>
        </div>

        <PerfBar perf={perf} />

        <div className="mt-4 text-dt-ink">
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

        {/* Always rendered, so the 0-to-1 selection never changes the card height: the Book button
            (fixed h-10) is always present, and the chips replace the hint in the same row. It only
            grows if many chips wrap, which is genuine content, not a pop-in. */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-dt-line pt-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {slot && selectedSeats.size > 0 ? (
              Array.from(selectedSeats)
                .map((id) => ({ id, name: seatName(id), price: sectionOf(id)?.price }))
                .sort((x, y) => x.name.localeCompare(y.name))
                .map(({ id, name, price }) => (
                  <span key={id} className="dt-rise inline-flex h-7 items-center gap-1 rounded-full bg-dt-sunken px-2.5 text-[12.5px] font-medium tabular-nums text-dt-ink">
                    {name}
                    {price != null && <span className="text-dt-ink-3">${price}</span>}
                  </span>
                ))
            ) : (
              <span className="text-[13px] text-dt-ink-3">Tap a free seat. It is held for you until you book or let go.</span>
            )}
          </div>
          <BookButton onClick={handleBookHeld} loading={isPending} disabled={selectedSeats.size === 0}>
            Book{selectedSeats.size > 0 ? ` ${selectedSeats.size}` : ""}
            {selectedTotal > 0 && ` · $${selectedTotal.toLocaleString()}`}
          </BookButton>
        </div>
      </div>

      <BookingConfirmedModal result={result} onClose={() => setResult(null)} onBookAnother={() => setResult(null)} />
    </>
  );
}

function EmptySurface() {
  return <div className="py-16 text-center text-sm text-dt-ink-3">No showtime available right now.</div>;
}

function fmtMs(n: number): string {
  return (n < 10 ? n.toFixed(1) : String(Math.round(n))) + " ms";
}

/** Real round-trip timings to Δt for this client: a read, the hold→broadcast loop, and a booking. */
function PerfBar({ perf }: { perf: { read?: number; book?: number; live?: number } }) {
  const stats: { label: string; hint: string; value?: number }[] = [
    { label: "Read", hint: "Availability and holds, one round trip", value: perf.read },
    { label: "Broadcast", hint: "Your hold reaching every other screen", value: perf.live },
    { label: "Book", hint: "Every held seat booked in one step", value: perf.book },
  ];
  return (
    <div className="mt-4 grid grid-cols-3 divide-x divide-dt-line border-y border-dt-line py-2.5">
      {stats.map((s) => (
        <span key={s.label} className="px-3 first:pl-0" title={s.hint}>
          <span className="block text-[11.5px] text-dt-ink-3">{s.label}</span>
          <span className="mt-0.5 block font-mono text-[13px] font-semibold tabular-nums text-dt-ink">
            {s.value != null ? fmtMs(s.value) : <span className="font-sans font-normal text-dt-ink-3">waiting</span>}
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
        "flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-2xl px-4 py-2.5 text-sm",
        expiring ? "bg-dt-held-soft text-dt-held-ink" : "bg-dt-sunken text-dt-ink-2"
      )}
    >
      <span>{expiring ? "Live updates pause soon to keep the demo fast." : "Live updates paused."}</span>
      <button
        type="button"
        onClick={onResume}
        className="inline-flex h-9 items-center rounded-full bg-dt-ink px-4 text-[13px] font-medium text-dt-on-ink transition-[background-color,transform] duration-150 hover:bg-dt-ink/85 active:scale-[0.97]"
      >
        {expiring ? "Keep watching" : "Resume"}
      </button>
    </div>
  );
}
