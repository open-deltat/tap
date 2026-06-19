"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Shuffle, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Stage } from "@/components/stage";
import { useWebSocket } from "@/hooks/use-websocket";
import type { Resource, Booking } from "@/lib/schemas";
import type { DeltaTEvent } from "@open-tap/client";
import { dayBounds, formatTime } from "@/lib/time";
import { formatError } from "@/lib/format-error";

import { seedLive } from "@/app/actions/seed-live";
import { getResources } from "@/app/actions/resources";
import { getAvailability } from "@/app/actions/availability";
import { getMultiResourceBookings, bookSlot } from "@/app/actions/bookings";

interface Seat {
  res: Resource;
  booking: Booking | null;
}

export function LiveRoom() {
  const [seats, setSeats] = useState<Resource[]>([]);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [slot, setSlot] = useState<{ start: number; end: number } | null>(null);
  const [bookings, setBookings] = useState<Map<string, Booking>>(new Map());
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Two independent live clients, each with its own "last event" pulse for the badge.
  const [pulse, setPulse] = useState<{ A: number; B: number }>({ A: 0, B: 0 });

  const loadBookings = useCallback(
    async (seatIds: string[], start: number, end: number) => {
      if (seatIds.length === 0) return;
      const map = await getMultiResourceBookings(seatIds);
      const next = new Map<string, Booking>();
      for (const [id, bks] of Object.entries(map)) {
        const live = (bks as Booking[]).find((b) => b.start < end && b.end > start);
        if (live) next.set(id, live);
      }
      setBookings(next);
    },
    []
  );

  useEffect(() => {
    (async () => {
      try {
        const id = await seedLive();
        const all = await getResources();
        const venueSeats = all.filter((r) => r.parentId === id);
        setVenueId(id);
        setSeats(venueSeats);

        const { dayStart, dayEnd } = dayBounds(new Date());
        const [daySlot] = await getAvailability(id, dayStart, dayEnd);
        if (daySlot) {
          setSlot({ start: daySlot.start, end: daySlot.end });
          await loadBookings(venueSeats.map((s) => s.id), daySlot.start, daySlot.end);
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

  // Each pane subscribes independently. The handler reloads bookings (the source of truth) and
  // pulses that pane's "received" badge so you can SEE the event land on the other client.
  const makeHandler = useCallback(
    (pane: "A" | "B") => (_event: DeltaTEvent) => {
      setPulse((p) => ({ ...p, [pane]: Date.now() }));
      if (slot) loadBookings(seats.map((s) => s.id), slot.start, slot.end);
    },
    [seats, slot, loadBookings]
  );

  useWebSocket(venueId ? { type: "subscribe", resourceId: venueId, onEvent: makeHandler("A") } : null);
  useWebSocket(venueId ? { type: "subscribe", resourceId: venueId, onEvent: makeHandler("B") } : null);

  function bookSeat(seat: Resource, label?: string) {
    if (!slot || bookings.has(seat.id)) return;
    startTransition(async () => {
      try {
        const booking = await bookSlot({
          resourceId: seat.id,
          start: slot.start,
          end: slot.end,
          label,
        });
        // Optimistic on the acting pane; the WS event repaints both from the server.
        setBookings((prev) => new Map(prev).set(seat.id, booking));
      } catch (err) {
        toast.error(formatError(err instanceof Error ? err.message : String(err)));
      }
    });
  }

  function blockRandom() {
    const free = seats.filter((s) => !bookings.has(s.id));
    if (free.length === 0) {
      toast.info("Every seat is taken — cancel one server-side to reset.");
      return;
    }
    const pick = free[Math.floor(Math.random() * free.length)];
    bookSeat(pick, "Blocked");
  }

  const seatData: Seat[] = seats.map((res) => ({ res, booking: bookings.get(res.id) ?? null }));
  const freeCount = seatData.filter((s) => !s.booking).length;

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
        {freeCount} of {seats.length} seats free
        {slot && ` · ${formatTime(slot.start)} – ${formatTime(slot.end)}`}
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={blockRandom}
        disabled={isPending || freeCount === 0}
        className="h-7 gap-1.5 border border-white/10 bg-white/5 text-xs text-zinc-200 hover:bg-white/10"
      >
        <Shuffle className="h-3.5 w-3.5" />
        Block a random seat
      </Button>
    </div>
  );

  return (
    <Stage primitive={{ label: "Realtime · LISTEN/NOTIFY", specId: "PROTO-01" }} title="Live Room" ribbon={ribbon}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ScreenPane name="Screen A" pulse={pulse.A} seats={seatData} onBook={(s) => bookSeat(s)} disabled={isPending} />
          <ScreenPane name="Screen B" pulse={pulse.B} seats={seatData} onBook={(s) => bookSeat(s)} disabled={isPending} />
        </div>

        <p className="text-center text-[11.5px] leading-relaxed text-zinc-500">
          Two clients, one deltat — no polling. Each screen holds its own WebSocket{" "}
          <code className="rounded bg-white/5 px-1 text-zinc-400">LISTEN</code> on the venue. Book or block a seat on one
          screen and deltat <code className="rounded bg-white/5 px-1 text-zinc-400">NOTIFY</code>s the other instantly.
        </p>
      </div>
    </Stage>
  );
}

function ScreenPane({
  name,
  pulse,
  seats,
  onBook,
  disabled,
}: {
  name: string;
  pulse: number;
  seats: Seat[];
  onBook: (seat: Resource) => void;
  disabled: boolean;
}) {
  const [live, setLive] = useState(false);

  // Flash a "received" badge for ~700ms each time this pane gets a NOTIFY.
  useEffect(() => {
    if (pulse === 0) return;
    setLive(true);
    const t = setTimeout(() => setLive(false), 700);
    return () => clearTimeout(t);
  }, [pulse]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-200">{name}</span>
        <span
          className={cn(
            "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors",
            live
              ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
              : "border-white/10 text-zinc-500"
          )}
        >
          <Wifi className="h-3 w-3" />
          {live ? "notify" : "listening"}
        </span>
      </div>

      <div className="grid grid-cols-6 gap-1.5">
        {seats.map(({ res, booking }) => {
          const blocked = booking?.label === "Blocked";
          return (
            <button
              key={res.id}
              type="button"
              disabled={disabled || booking != null}
              onClick={() => onBook(res)}
              title={booking ? booking.label ?? res.name ?? "" : `Book ${res.name}`}
              className={cn(
                "aspect-square rounded-md border text-[10px] font-medium transition-colors",
                booking == null && "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-200",
                booking != null && !blocked && "border-sky-400/40 bg-sky-500/25 text-sky-100",
                blocked && "border-rose-400/40 bg-rose-500/20 text-rose-200"
              )}
            >
              {res.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
