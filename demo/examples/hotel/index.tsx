"use client";

import { useEffect, useState, useTransition, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Loader2, X, CalendarRange, Wand2 } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { Booking, Resource } from "@/lib/schemas";
import { BookingConfirmedModal, type BookingResult } from "@/components/booking-confirmed-modal";

import { ensureHotel, type HotelRoomType } from "./seed";
import { CHECK_IN_HOUR, CHECK_OUT_HOUR } from "./policy";
import { batchBookSlots, getBookingsForResource, cancelBooking } from "@/app/actions/bookings";
import { formatError } from "@/lib/format-error";
import { AvailabilityStrip } from "./availability-strip";
import { occupancyByNight, bookedNightSets, stableOpenings } from "./occupancy";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const HORIZON = 30; // nights bookable from today
const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const hourLabel = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`;
const midnight = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};
const addDays = (ms: number, n: number) => {
  const x = new Date(ms);
  x.setDate(x.getDate() + n);
  x.setHours(0, 0, 0, 0);
  return x;
};

function asResource(rt: HotelRoomType): Resource {
  return {
    id: rt.id,
    parentId: null,
    name: rt.name,
    capacity: rt.capacity,
    bufferAfter: null,
    slotMinutes: DAY / 60_000,
    price: null,
    bufferMinutes: 0,
  };
}

export default function HotelPage() {
  const [types, setTypes] = useState<HotelRoomType[]>([]);
  const [bookingsByType, setBookingsByType] = useState<Record<string, Booking[]>>({});
  const [selTypeId, setSelTypeId] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange | undefined>();
  const [guest, setGuest] = useState("");
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BookingResult | null>(null);

  const todayMs = useMemo(() => midnight(new Date()), []);

  const refresh = useCallback(async (rooms: HotelRoomType[]) => {
    const entries = await Promise.all(
      rooms.map(async (rt) => [rt.id, await getBookingsForResource(rt.id)] as const)
    );
    setBookingsByType(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const rooms = await ensureHotel();
        setTypes(rooms);
        setSelTypeId(rooms[0]?.id ?? null);
        await refresh(rooms);
      } catch {
        toast.error("Failed to connect to deltat. Is it running?");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selType = types.find((t) => t.id === selTypeId) ?? types[0] ?? null;
  const selBookings = useMemo(
    () => (selType ? bookingsByType[selType.id] ?? [] : []),
    [selType, bookingsByType]
  );

  // Per-night occupancy for the chosen type — validates the picked range and marks full nights.
  const occ = useMemo(() => occupancyByNight(selBookings), [selBookings]);
  const fullNights = useMemo(
    () => (selType ? bookedNightSets(selBookings, selType.capacity).full : []),
    [selBookings, selType]
  );

  const fromMs = range?.from ? midnight(range.from) : null;
  const toMs = range?.to ? midnight(range.to) : null;

  // Nights actually slept: check-in date .. the night before check-out (DST-safe date cursor).
  const nightTs = useMemo(() => {
    if (fromMs == null || toMs == null || toMs <= fromMs) return [];
    const out: number[] = [];
    const c = new Date(fromMs);
    while (c.getTime() < toMs) {
      out.push(c.getTime());
      c.setDate(c.getDate() + 1);
    }
    return out;
  }, [fromMs, toMs]);

  const nights = nightTs.length;
  const spanValid =
    selType != null && nights > 0 && nightTs.every((t) => (occ.get(t)?.taken ?? 0) < selType.capacity);

  function applyOpening(kind: "soonest" | "longest") {
    if (!selType) return;
    const ops = stableOpenings(selBookings, selType.capacity, 1, todayMs, HORIZON);
    if (ops.length === 0) {
      toast.error("No openings in the next 30 nights");
      return;
    }
    const pick = kind === "longest" ? ops.reduce((a, b) => (b.nights > a.nights ? b : a)) : ops[0];
    // Soonest defaults to a 2-night stay (capped to the opening); longest takes the whole run.
    const n = kind === "longest" ? pick.nights : Math.min(2, pick.nights);
    setRange({ from: new Date(pick.start), to: addDays(pick.start, n) });
  }

  function book() {
    if (!selType || fromMs == null || nights < 1 || !spanValid) return;
    const rt = selType;
    const start = fromMs + CHECK_IN_HOUR * HOUR;
    const end = fromMs + nights * DAY + CHECK_OUT_HOUR * HOUR;
    const label = guest.trim() ? `${guest.trim()} · ${nights}-night stay` : `${nights}-night stay`;
    startTransition(async () => {
      try {
        const created = await batchBookSlots([{ resourceId: rt.id, start, end, label }]);
        setResult({
          title: `${rt.name} · ${nights} night${nights > 1 ? "s" : ""}`,
          subtitle: `${fmt(start)} ${hourLabel(CHECK_IN_HOUR)} → ${fmt(end)} ${hourLabel(CHECK_OUT_HOUR)}`,
          bookings: created,
          resources: [asResource(rt)],
        });
        setGuest("");
        setRange(undefined);
        await refresh(types);
      } catch (err) {
        toast.error(formatError((err as Error).message) ?? "Those dates just filled up");
        await refresh(types);
      }
    });
  }

  function release(b: Booking) {
    startTransition(async () => {
      try {
        await cancelBooking(b.id);
        await refresh(types);
      } catch (err) {
        toast.error(formatError((err as Error).message) ?? "Could not cancel");
      }
    });
  }

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

  return (
    <div className="flex h-full flex-col bg-[#0a0a0c] text-zinc-100">
      <div className="shrink-0 pb-3 pt-6 text-center">
        <div className="text-sm font-medium text-zinc-300">Grand Hotel</div>
        <div className="mt-1.5 flex items-center justify-center gap-2 text-[10.5px] uppercase tracking-[0.2em] text-zinc-500">
          <span>Capacity sweep · availability windows</span>
          <span className="rounded border border-white/10 px-1 py-px font-mono text-[9px] tracking-normal text-zinc-500">
            AVAIL-04
          </span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-px overflow-hidden bg-white/[0.06] lg:grid-cols-2">
        {/* Front desk — read-only occupancy overview + manage reservations */}
        <section className="flex min-h-0 flex-col overflow-auto bg-[#0a0a0c] p-6">
          <header className="mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Front desk</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Rooms taken per night over the next 30 nights. <Legend />
            </p>
          </header>
          <div className="space-y-5">
            {types.map((rt) => {
              const all = bookingsByType[rt.id] ?? [];
              const sorted = [...all].sort((a, b) => a.start - b.start);
              return (
                <div key={rt.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                  <RoomHeader rt={rt} />
                  <div className="mt-3">
                    <AvailabilityStrip capacity={rt.capacity} bookings={all} fromMs={todayMs} />
                  </div>
                  {sorted.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {sorted.slice(0, 6).map((b) => (
                        <li
                          key={b.id}
                          className="flex items-center justify-between gap-2 rounded bg-white/[0.03] px-2 py-1 text-xs text-zinc-400"
                        >
                          <span className="truncate">
                            <span className="text-zinc-300">{b.label || "Reservation"}</span>
                            <span className="ml-2 font-mono text-[10px] text-zinc-500">
                              {fmt(b.start)} → {fmt(b.end)}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => release(b)}
                            disabled={isPending}
                            className="shrink-0 text-zinc-500 transition-colors hover:text-rose-300"
                            aria-label="Cancel reservation"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Book a stay — pick a room, pick your dates, we validate against availability */}
        <section className="flex min-h-0 flex-col overflow-auto bg-[#0a0a0c] p-6">
          <header className="mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Book a stay</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Pick a room and your dates — deltat checks every night is open. Check-in{" "}
              {hourLabel(CHECK_IN_HOUR)} · check-out {hourLabel(CHECK_OUT_HOUR)}.
            </p>
          </header>

          {/* Room type */}
          <div className="mb-4 flex flex-wrap gap-2">
            {types.map((rt) => {
              const active = rt.id === selType?.id;
              return (
                <button
                  key={rt.id}
                  type="button"
                  onClick={() => {
                    setSelTypeId(rt.id);
                    setRange(undefined);
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                      : "border-white/10 text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  {rt.name}
                  <span className="ml-1.5 font-mono text-[10px] text-zinc-500">×{rt.capacity}</span>
                </button>
              );
            })}
          </div>

          {/* Instant finders — the SYNC-01 capability surfaced as one-tap helpers */}
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyOpening("soonest")}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:border-emerald-400/30 hover:text-emerald-200"
            >
              <CalendarRange className="h-3.5 w-3.5" /> Soonest opening
            </button>
            <button
              type="button"
              onClick={() => applyOpening("longest")}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:border-emerald-400/30 hover:text-emerald-200"
            >
              <Wand2 className="h-3.5 w-3.5" /> Longest stay available
            </button>
          </div>

          {/* Range picker — full nights are marked, past is disabled */}
          <div className="flex justify-center rounded-lg border border-white/10 bg-white/[0.02] p-2 [color-scheme:dark]">
            <Calendar
              mode="range"
              required={false}
              selected={range}
              onSelect={setRange}
              defaultMonth={new Date(todayMs)}
              startMonth={new Date(todayMs)}
              disabled={{ before: new Date(todayMs), after: addDays(todayMs, HORIZON) }}
              modifiers={{ full: fullNights }}
              modifiersClassNames={{ full: "text-rose-300/80 line-through" }}
              className="bg-transparent text-zinc-100"
            />
          </div>

          {/* Summary + book */}
          <div className="mt-4 border-t border-white/[0.06] pt-4">
            {nights > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300">
                    {fmt(fromMs!)} → {fmt(toMs!)} ·{" "}
                    <span className="font-mono">{nights} night{nights > 1 ? "s" : ""}</span>
                  </span>
                  <span className={spanValid ? "text-emerald-300" : "text-rose-300"}>
                    {spanValid ? "all nights open" : "includes a full night"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={guest}
                    onChange={(e) => setGuest(e.target.value)}
                    placeholder="Name on the reservation (optional)"
                    className="h-9 flex-1 border-white/10 bg-white/5 text-sm text-zinc-100 placeholder:text-zinc-600"
                  />
                  <Button
                    onClick={book}
                    disabled={isPending || !spanValid}
                    className="h-9 bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-40"
                  >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Book ${nights}n`}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-center text-xs text-zinc-500">
                Pick a check-in and check-out date, or use an instant finder above.
              </p>
            )}
          </div>
        </section>
      </div>

      <BookingConfirmedModal
        result={result}
        onClose={() => setResult(null)}
        onBookAnother={() => setResult(null)}
      />

      {isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Working…
          </div>
        </div>
      )}
    </div>
  );
}

function RoomHeader({ rt }: { rt: HotelRoomType }) {
  return (
    <div className="flex items-baseline justify-between">
      <div className="text-sm font-semibold text-zinc-100">{rt.name}</div>
      <div className="font-mono text-xs text-zinc-500">
        {rt.capacity} room{rt.capacity > 1 ? "s" : ""}
      </div>
    </div>
  );
}

function Legend() {
  const items = [
    { cls: "bg-emerald-500/70", label: "open room" },
    { cls: "bg-rose-500/55", label: "booked room" },
  ];
  return (
    <span className="ml-1 inline-flex items-center gap-2 align-middle">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1 text-[10px] text-zinc-500">
          <span className={`inline-block h-2 w-2 rounded-sm ${it.cls}`} />
          {it.label}
        </span>
      ))}
    </span>
  );
}
