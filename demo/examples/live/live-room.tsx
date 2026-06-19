"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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

import { seedLive } from "./seed";
import { getResources } from "@/app/actions/resources";
import { getAvailability } from "@/app/actions/availability";
import { getMultiResourceBookings, bookSlot } from "@/app/actions/bookings";

// Which client booked a seat. Purely a client-side hint — deltat stores one identical booking
// no matter who acted; the color just lets you SEE the cross-client NOTIFY arrive.
type Origin = "A" | "B" | "sim";

interface ClientAccent {
  key: Origin;
  name: string;
  /** Tailwind classes for a seat this client booked. */
  seat: string;
  /** Tailwind classes for the pane chrome + live pulse. */
  pane: string;
  paneLive: string;
  screen: string;
  dot: string;
  badge: string;
  badgeLive: string;
  hover: string;
}

const ACCENTS: Record<"A" | "B", ClientAccent> = {
  A: {
    key: "A",
    name: "Client A",
    seat: "border-emerald-400/50 bg-emerald-500/30 text-emerald-100",
    pane: "border-emerald-400/20",
    paneLive: "border-emerald-400/50 ring-1 ring-emerald-400/30",
    screen: "bg-emerald-400/70 shadow-[0_0_18px_4px_rgba(52,211,153,0.45)]",
    dot: "bg-emerald-400",
    badge: "border-white/10 text-zinc-500",
    badgeLive: "border-emerald-400/40 bg-emerald-400/15 text-emerald-200",
    hover:
      "hover:border-emerald-400/50 hover:bg-emerald-400/15 hover:text-emerald-100",
  },
  B: {
    key: "B",
    name: "Client B",
    seat: "border-sky-400/50 bg-sky-500/30 text-sky-100",
    pane: "border-sky-400/20",
    paneLive: "border-sky-400/50 ring-1 ring-sky-400/30",
    screen: "bg-sky-400/70 shadow-[0_0_18px_4px_rgba(56,189,248,0.45)]",
    dot: "bg-sky-400",
    badge: "border-white/10 text-zinc-500",
    badgeLive: "border-sky-400/40 bg-sky-400/15 text-sky-200",
    hover: "hover:border-sky-400/50 hover:bg-sky-400/15 hover:text-sky-100",
  },
};

// A booking made by the "simulate" button = a third visitor. Rendered amber so it's clearly
// neither pane's own click.
const SIM_SEAT = "border-amber-400/50 bg-amber-500/30 text-amber-100";

interface Seat {
  res: Resource;
  booking: Booking | null;
  origin: Origin | null;
}

// "A3" → { row: "A", col: 3 }. Anything that doesn't parse falls into a trailing catch-all row
// so a seat is never silently dropped from the grid.
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

  // Server is the source of truth for WHICH seats are booked. This map is a client-side hint of
  // WHO booked each seat — set locally at click time, read back when a NOTIFY repaints both panes.
  const originRef = useRef<Map<string, Origin>>(new Map());

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

  // Both panes book onto the SAME venue/slot. The only difference is the origin hint we record so
  // the seat colors which client acted.
  const book = useCallback(
    (seat: Resource, origin: Origin, label: string) => {
      if (!slot || bookings.has(seat.id)) return;
      originRef.current.set(seat.id, origin);
      startTransition(async () => {
        try {
          const booking = await bookSlot({
            resourceId: seat.id,
            start: slot.start,
            end: slot.end,
            label,
          });
          // Optimistic on the acting client; the NOTIFY repaints both panes from the server.
          setBookings((prev) => new Map(prev).set(seat.id, booking));
        } catch (err) {
          originRef.current.delete(seat.id);
          toast.error(formatError(err instanceof Error ? err.message : String(err)));
        }
      });
    },
    [slot, bookings]
  );

  const simulateOther = useCallback(() => {
    const free = seats.filter((s) => !bookings.has(s.id));
    if (free.length === 0) {
      toast.info("Every seat is taken — cancel one server-side to reset.");
      return;
    }
    const pick = free[Math.floor(Math.random() * free.length)];
    book(pick, "sim", "Another visitor");
  }, [seats, bookings, book]);

  const seatData: Seat[] = useMemo(
    () =>
      seats.map((res) => ({
        res,
        booking: bookings.get(res.id) ?? null,
        origin: bookings.has(res.id) ? originRef.current.get(res.id) ?? null : null,
      })),
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
        Simulate another visitor
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
          <CinemaPane
            accent={ACCENTS.A}
            grid={grid}
            venueId={venueId}
            disabled={isPending}
            onBook={(s) => book(s, "A", "Client A")}
          />
          <CinemaPane
            accent={ACCENTS.B}
            grid={grid}
            venueId={venueId}
            disabled={isPending}
            onBook={(s) => book(s, "B", "Client B")}
          />
        </div>

        <p className="text-center text-[11.5px] leading-relaxed text-zinc-500">
          Two clients, one deltat — book on either side, no polling. Each pane holds its own
          WebSocket{" "}
          <code className="rounded bg-white/5 px-1 text-zinc-400">LISTEN</code> on the venue, so
          booking a seat in <span className="text-emerald-300/80">Client A</span> makes deltat{" "}
          <code className="rounded bg-white/5 px-1 text-zinc-400">NOTIFY</code>{" "}
          <span className="text-sky-300/80">Client B</span> the instant it lands.
        </p>
      </div>
    </Stage>
  );
}

function CinemaPane({
  accent,
  grid,
  venueId,
  disabled,
  onBook,
}: {
  accent: ClientAccent;
  grid: CinemaGrid;
  venueId: string | null;
  disabled: boolean;
  onBook: (seat: Resource) => void;
}) {
  // Each pane is its own client: its own WebSocket subscription, its own live pulse. The data it
  // renders is the shared server-truth bookings map (passed down via grid), so when the OTHER
  // pane books, this pane's socket receives the NOTIFY and the grid repaints under it.
  const [live, setLive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onEvent = useCallback((_event: DeltaTEvent) => {
    setLive(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLive(false), 700);
  }, []);
  useWebSocket(venueId ? { type: "subscribe", resourceId: venueId, onEvent } : null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-white/[0.02] p-4 transition-colors",
        accent.pane,
        live && accent.paneLive
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-zinc-200">
          <span className={cn("h-2 w-2 rounded-full", accent.dot)} />
          {accent.name}
        </span>
        <span
          className={cn(
            "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors",
            live ? accent.badgeLive : accent.badge
          )}
        >
          <Wifi className="h-3 w-3" />
          {live ? "notify" : "live"}
        </span>
      </div>

      <Screen className={accent.screen} />

      <div className="mt-4 flex flex-col items-center gap-1.5">
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
                    accent={accent}
                    disabled={disabled}
                    onBook={onBook}
                  />
                ) : (
                  <div key={`gap-${row.label}-${ci}`} className="h-9 w-9" />
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Screen({ className }: { className: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className={cn("relative h-1.5 w-[78%] rounded-full", className)} />
      <span className="mt-1.5 text-[9px] uppercase tracking-[0.35em] text-zinc-500">
        Screen
      </span>
    </div>
  );
}

function SeatButton({
  seat,
  accent,
  disabled,
  onBook,
}: {
  seat: Seat;
  accent: ClientAccent;
  disabled: boolean;
  onBook: (seat: Resource) => void;
}) {
  const { res, booking, origin } = seat;

  // A booked seat is colored by WHO booked it (the origin hint), not by which pane is rendering —
  // that's how you see, in this pane, a seat the OTHER client just took.
  const bookedClass =
    origin === "sim"
      ? SIM_SEAT
      : origin === "B"
        ? ACCENTS.B.seat
        : origin === "A"
          ? ACCENTS.A.seat
          : // Booked but no local origin (e.g. a pre-existing booking) — fall back to this pane's accent.
            accent.seat;

  return (
    <button
      type="button"
      disabled={disabled || booking != null}
      onClick={() => onBook(res)}
      title={
        booking
          ? `${res.name} — ${booking.label ?? "Booked"}`
          : `Book ${res.name} from ${accent.name}`
      }
      className={cn(
        "h-9 w-9 rounded-md rounded-b-lg border text-[10px] font-medium transition-colors",
        booking == null &&
          cn("border-white/10 bg-white/[0.04] text-zinc-400", accent.hover),
        booking != null && bookedClass
      )}
    >
      {res.name}
    </button>
  );
}
