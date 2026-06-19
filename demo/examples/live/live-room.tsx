"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Eye, Loader2, Shuffle, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Stage } from "@/components/stage";
import { useWebSocket } from "@/hooks/use-websocket";
import type { Resource, Booking } from "@/lib/schemas";
import type { DeltaTEvent } from "@open-tap/client";
import { dayBounds, formatTime } from "@/lib/time";
import { formatError } from "@/lib/format-error";

import { seedLive } from "./seed";
import { getResources } from "@/app/actions/resources";
import { getAvailability } from "@/app/actions/availability";
import { getMultiResourceBookings, bookSlot } from "@/app/actions/bookings";

interface Seat {
  res: Resource;
  booking: Booking | null;
}

// "A3" → { row: "A", col: 3 }. The seed names seats letter-first; anything that doesn't parse
// falls into a trailing catch-all row so a seat is never silently dropped from the grid.
function parseSeat(name: string): { row: string; col: number } | null {
  const m = name.match(/^([A-Za-z]+)(\d+)$/);
  if (!m) return null;
  return { row: m[1].toUpperCase(), col: parseInt(m[2], 10) };
}

interface CinemaGrid {
  rows: { label: string; seats: (Seat | null)[] }[];
}

function buildGrid(seats: Seat[]): CinemaGrid {
  const parsed = seats.map((s) => ({ seat: s, pos: parseSeat(s.res.name ?? "") }));
  const cols = [...new Set(parsed.flatMap((p) => (p.pos ? [p.pos.col] : [])))].sort(
    (a, b) => a - b
  );
  const rowLabels = [...new Set(parsed.flatMap((p) => (p.pos ? [p.pos.row] : [])))].sort();

  const byPos = new Map<string, Seat>();
  for (const { seat, pos } of parsed) {
    if (pos) byPos.set(`${pos.row}-${pos.col}`, seat);
  }

  const rows = rowLabels.map((label) => ({
    label,
    seats: cols.map((col) => byPos.get(`${label}-${col}`) ?? null),
  }));

  // Anything unparsable goes in one extra row so it stays visible.
  const orphans = parsed.filter((p) => !p.pos).map((p) => p.seat);
  if (orphans.length > 0) {
    rows.push({ label: "·", seats: orphans });
  }

  return { rows };
}

export function LiveRoom() {
  const [seats, setSeats] = useState<Resource[]>([]);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [slot, setSlot] = useState<{ start: number; end: number } | null>(null);
  const [bookings, setBookings] = useState<Map<string, Booking>>(new Map());
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Bumped on every NOTIFY so the mirror pane can flash a "live" pulse — that's the whole point:
  // the other client repaints without anyone touching it.
  const [pulse, setPulse] = useState(0);

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

  // One venue subscription drives the shared bookings map. Both panes render from it, so the
  // mirror repaints the moment deltat NOTIFYs — no second booking surface, no polling.
  const onEvent = useCallback(
    (_event: DeltaTEvent) => {
      setPulse(Date.now());
      if (slot) loadBookings(seats.map((s) => s.id), slot.start, slot.end);
    },
    [seats, slot, loadBookings]
  );
  useWebSocket(venueId ? { type: "subscribe", resourceId: venueId, onEvent } : null);

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
        // Optimistic on this client; the WS event repaints both panes from the server.
        setBookings((prev) => new Map(prev).set(seat.id, booking));
      } catch (err) {
        toast.error(formatError(err instanceof Error ? err.message : String(err)));
      }
    });
  }

  function simulateOther() {
    const free = seats.filter((s) => !bookings.has(s.id));
    if (free.length === 0) {
      toast.info("Every seat is taken — cancel one server-side to reset.");
      return;
    }
    const pick = free[Math.floor(Math.random() * free.length)];
    bookSeat(pick, "Another visitor");
  }

  const seatData: Seat[] = useMemo(
    () => seats.map((res) => ({ res, booking: bookings.get(res.id) ?? null })),
    [seats, bookings]
  );
  const grid = useMemo(() => buildGrid(seatData), [seatData]);
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
        onClick={simulateOther}
        disabled={isPending || freeCount === 0}
        className="h-7 gap-1.5 border border-white/10 bg-white/5 text-xs text-zinc-200 hover:bg-white/10"
      >
        <Shuffle className="h-3.5 w-3.5" />
        Simulate another booking
      </Button>
    </div>
  );

  return (
    <Stage
      primitive={{ label: "Realtime · LISTEN/NOTIFY", specId: "PROTO-01" }}
      title="Live Room"
      ribbon={ribbon}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CinemaPane grid={grid} mode="you" onBook={(s) => bookSeat(s)} disabled={isPending} />
          <CinemaPane grid={grid} mode="mirror" pulse={pulse} />
        </div>

        <p className="text-center text-[11.5px] leading-relaxed text-zinc-500">
          Two clients, one deltat — no polling. Each pane holds its own WebSocket{" "}
          <code className="rounded bg-white/5 px-1 text-zinc-400">LISTEN</code> on the venue. Book a
          seat on the left and deltat{" "}
          <code className="rounded bg-white/5 px-1 text-zinc-400">NOTIFY</code>s the mirror on the
          right the instant it lands.
        </p>
      </div>
    </Stage>
  );
}

function CinemaPane({
  grid,
  mode,
  onBook,
  disabled,
  pulse,
}: {
  grid: CinemaGrid;
  mode: "you" | "mirror";
  onBook?: (seat: Resource) => void;
  disabled?: boolean;
  pulse?: number;
}) {
  const mirror = mode === "mirror";
  const [live, setLive] = useState(false);

  // Flash a "received" pulse for ~700ms each time a NOTIFY lands on the mirror.
  useEffect(() => {
    if (!pulse) return;
    setLive(true);
    const t = setTimeout(() => setLive(false), 700);
    return () => clearTimeout(t);
  }, [pulse]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-white/[0.02] p-4 transition-colors",
        mirror
          ? "border-white/10"
          : "border-emerald-400/25 ring-1 ring-emerald-400/10",
        mirror && live && "border-emerald-400/40 ring-1 ring-emerald-400/30"
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-200">
          {mirror ? (
            <>
              <Eye className="h-3.5 w-3.5 text-zinc-400" />
              Another visitor
            </>
          ) : (
            "You"
          )}
        </span>
        <span
          className={cn(
            "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors",
            mirror && live
              ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
              : "border-white/10 text-zinc-500"
          )}
        >
          <Wifi className="h-3 w-3" />
          {mirror ? (live ? "notify" : "live") : "bookable"}
        </span>
      </div>

      {mirror && (
        <div className="mb-3 flex items-center gap-1.5 rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-[10.5px] text-zinc-400">
          <Eye className="h-3 w-3 shrink-0 text-zinc-500" />
          What another visitor sees — updates in real time
        </div>
      )}

      <Screen />

      <div
        className={cn(
          "mt-4 flex flex-col items-center gap-1.5",
          // The mirror is a viewport, not a booking surface: dim it and swallow clicks.
          mirror && "pointer-events-none opacity-80"
        )}
      >
        {grid.rows.map((row) => (
          <div key={row.label} className="flex items-center gap-1.5">
            <span className="w-3 text-right text-[9px] font-medium text-zinc-600">
              {row.label}
            </span>
            <div className="flex gap-1.5">
              {row.seats.map((seat, ci) =>
                seat ? (
                  <SeatButton
                    key={seat.res.id}
                    seat={seat}
                    mirror={mirror}
                    disabled={!!disabled}
                    onBook={onBook}
                  />
                ) : (
                  <div key={`gap-${row.label}-${ci}`} className="h-8 w-8" />
                )
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Subtle scrim over the mirror to read it as a reflected viewport. */}
      {mirror && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/20"
        />
      )}
    </div>
  );
}

function Screen() {
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-1.5 w-[78%] rounded-full bg-emerald-400/70 shadow-[0_0_18px_4px_rgba(52,211,153,0.45)]" />
      <span className="mt-1.5 text-[9px] uppercase tracking-[0.35em] text-zinc-500">
        Screen
      </span>
    </div>
  );
}

function SeatButton({
  seat,
  mirror,
  disabled,
  onBook,
}: {
  seat: Seat;
  mirror: boolean;
  disabled: boolean;
  onBook?: (seat: Resource) => void;
}) {
  const { res, booking } = seat;
  const byOther = booking?.label === "Another visitor";

  return (
    <button
      type="button"
      disabled={mirror || disabled || booking != null}
      onClick={() => onBook?.(res)}
      title={
        booking
          ? `${res.name} — ${booking.label ?? "Booked"}`
          : mirror
            ? `${res.name} — open`
            : `Book ${res.name}`
      }
      className={cn(
        "h-8 w-8 rounded-md rounded-b-lg border text-[10px] font-medium transition-colors",
        booking == null &&
          !mirror &&
          "border-white/10 bg-white/[0.04] text-zinc-400 hover:border-emerald-400/50 hover:bg-emerald-400/15 hover:text-emerald-100",
        booking == null &&
          mirror &&
          "border-white/10 bg-white/[0.04] text-zinc-500",
        booking != null && !byOther && "border-emerald-400/40 bg-emerald-500/25 text-emerald-100",
        byOther && "border-sky-400/40 bg-sky-500/25 text-sky-100"
      )}
    >
      {res.name}
    </button>
  );
}
