"use client";

import { useEffect, useState, useTransition, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Loader2, X, CalendarRange, Wand2 } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "../../components/ui/calendar";
import { Segmented } from "../../components/ui/segmented";
import { Stage } from "../../components/stage";
import { BookButton } from "../../components/book-button";
import type { Booking, Resource } from "../../lib/schemas";
import { BookingConfirmedModal, type BookingResult } from "../../components/booking-confirmed-modal";

import { ensureHotel, type HotelRoomType } from "./seed";
import { CHECK_IN_HOUR, CHECK_OUT_HOUR } from "./policy";
import { batchBookSlots, getBookingsForResource, cancelBooking } from "../../actions/bookings";
import { useWebSocket } from "../../hooks/use-websocket";
import { formatError } from "../../lib/format-error";
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
  const [rootId, setRootId] = useState<string | null>(null);
  const [bookingsByType, setBookingsByType] = useState<Record<string, Booking[]>>({});
  const [selTypeId, setSelTypeId] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange | undefined>();
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
        const { rootId: rid, rooms } = await ensureHotel();
        setRootId(rid);
        setTypes(rooms);
        setSelTypeId(rooms[0]?.id ?? null);
        await refresh(rooms);
      } catch {
        toast.error("Failed to connect to Δt. Is it running?");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live: every type bubbles to the hotel root, so one subscription re-reads occupancy whenever
  // anyone books or cancels, debounced + ref-read so a burst coalesces with the latest types.
  const typesRef = useRef(types);
  typesRef.current = types;
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const liveReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => void refresh(typesRef.current), 200);
  }, [refresh]);
  useEffect(() => () => clearTimeout(reloadTimer.current), []);
  useWebSocket(rootId ? { type: "subscribe", resourceId: rootId, onEvent: liveReload } : null);

  const selType = types.find((t) => t.id === selTypeId) ?? types[0] ?? null;
  const selBookings = useMemo(
    () => (selType ? bookingsByType[selType.id] ?? [] : []),
    [selType, bookingsByType]
  );

  // Per-night occupancy for the chosen type, validates the picked range and marks full nights.
  const occ = useMemo(() => occupancyByNight(selBookings), [selBookings]);
  const fullNights = useMemo(
    () => (selType ? bookedNightSets(selBookings, selType.capacity).full : []),
    [selBookings, selType]
  );

  const cap = selType?.capacity ?? 1;
  const isFull = useCallback((t: number) => (occ.get(t)?.taken ?? 0) >= cap, [occ, cap]);
  // First fully-booked night at or after `anchor`: the night you can't sleep, so it's the latest
  // possible check-OUT (you leave that morning). null = no full night within the horizon.
  const firstFullFrom = useCallback(
    (anchor: number): number | null => {
      const c = new Date(anchor);
      for (let i = 0; i <= HORIZON; i++) {
        if (isFull(c.getTime())) return c.getTime();
        c.setDate(c.getDate() + 1);
      }
      return null;
    },
    [isFull]
  );
  const firstOpenFrom = useCallback(
    (anchor: number): number => {
      const c = new Date(anchor);
      for (let i = 0; i < HORIZON; i++) {
        if (!isFull(c.getTime())) return c.getTime();
        c.setDate(c.getDate() + 1);
      }
      return anchor;
    },
    [isFull]
  );

  const fromMs = range?.from ? midnight(range.from) : null;
  const toMs = range?.to ? midnight(range.to) : null;
  // The amber check-out boundary for the current check-in: the first booked night after it.
  const checkoutMs = fromMs != null ? firstFullFrom(fromMs) : null;

  // Default check-in to the first open night for the chosen room (today, usually).
  useEffect(() => {
    if (!selType) return;
    setRange({ from: new Date(firstOpenFrom(todayMs)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selTypeId, types.length]);

  // Two-anchor selection driven by the clicked day (not react-day-picker's range cycle, which
  // would keep `from` fixed when you click a later day and so freeze the amber boundary). While a
  // check-in is set and you click a LATER open day, that's your check-out, clamped to the first
  // booked night (you leave that morning). Any other click re-anchors check-in, so the amber
  // "last bookable night" recomputes live on every pick.
  function onSelectRange(_sel: DateRange | undefined, triggerDate: Date) {
    const c = midnight(triggerDate);
    if (range?.from && !range.to) {
      const from = midnight(range.from);
      if (c > from) {
        const ff = firstFullFrom(from);
        const to = ff != null && c > ff ? ff : c;
        setRange({ from: new Date(from), to: new Date(to) });
        return;
      }
    }
    if (isFull(c)) {
      toast.error("That night is booked, pick an open night to check in");
      return;
    }
    setRange({ from: new Date(c) }); // fresh check-in → amber boundary recomputes
  }

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
    const label = `${nights}-night stay`;
    startTransition(async () => {
      try {
        const created = await batchBookSlots([{ resourceId: rt.id, start, end, label }]);
        setResult({
          title: `${rt.name} · ${nights} night${nights > 1 ? "s" : ""}`,
          subtitle: `${fmt(start)} ${hourLabel(CHECK_IN_HOUR)} to ${fmt(end)} ${hourLabel(CHECK_OUT_HOUR)}`,
          bookings: created,
          resources: [asResource(rt)],
        });
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
          Connecting to Δt…
        </div>
      </div>
    );
  }

  const tray =
    nights > 0 && fromMs != null && toMs != null ? (
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-zinc-300">
          {selType?.name} · {fmt(fromMs)} to {fmt(toMs)} ·{" "}
          <span className="font-mono">
            {nights} night{nights > 1 ? "s" : ""}
          </span>
          {spanValid && <span className="ml-2 text-emerald-300">all nights open</span>}
        </div>
        <BookButton onClick={book} loading={isPending} disabled={!spanValid}>
          Book {nights} night{nights > 1 ? "s" : ""}
        </BookButton>
      </div>
    ) : undefined;

  return (
    <>
      <Stage
        primitive={{ label: "Find open nights to book", specId: "AVAIL-04" }}
        title="Grand Hotel"
        contentMax="max-w-6xl"
        tray={tray}
      >
        <div className="grid grid-cols-1 gap-7 lg:grid-cols-2">
          {/* Front desk: read-only occupancy overview + manage reservations */}
          <section>
            <header className="mb-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Front desk</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Rooms taken per night, next 30 nights. <Legend />
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
                  {/* Reserved baseline so booking/cancelling a room does not shove the next card. */}
                  <div className="mt-3 min-h-[3.5rem]">
                    {sorted.length > 0 && (
                    <ul className="space-y-1">
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
                </div>
              );
            })}
          </div>
        </section>

          {/* Book a stay: pick a room, pick your dates, we validate against availability */}
          <section>
            <header className="mb-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Book a stay</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Check-in {hourLabel(CHECK_IN_HOUR)} · check-out {hourLabel(CHECK_OUT_HOUR)}.
              </p>
            </header>

            {/* Room type */}
            <div className="mb-4 flex">
              <Segmented
                items={types.map((rt) => ({
                  value: rt.id,
                  label: (
                    <>
                      {rt.name}
                      <span className="ml-1.5 font-mono text-[10px] text-zinc-500">×{rt.capacity}</span>
                    </>
                  ),
                }))}
                value={selType?.id ?? null}
                onChange={(id) => setSelTypeId(id)}
                ariaLabel="Room type"
              />
            </div>

          {/* Instant finders: the SYNC-01 capability surfaced as one-tap helpers */}
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

          {/* Range picker: two months; booked nights struck through, the check-out boundary amber */}
          <div className="flex justify-center rounded-lg border border-white/10 bg-white/[0.02] p-2 [color-scheme:dark]">
            <Calendar
              mode="range"
              numberOfMonths={2}
              showOutsideDays={false}
              selected={range}
              onSelect={onSelectRange}
              defaultMonth={new Date(todayMs)}
              startMonth={new Date(todayMs)}
              disabled={{ before: new Date(todayMs), after: addDays(todayMs, HORIZON) }}
              modifiers={{
                booked: fullNights.filter((d) => checkoutMs == null || midnight(d) !== checkoutMs),
                checkout: checkoutMs != null ? [new Date(checkoutMs)] : [],
              }}
              modifiersClassNames={{
                booked: "text-rose-300/50 line-through",
                checkout: "rounded-md text-amber-200/70 ring-1 ring-amber-500/25",
              }}
              className="bg-transparent text-zinc-100"
            />
          </div>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
              Struck-through nights are booked. The <span className="text-amber-300">amber</span> night is
              bookable only as your check-out. You sleep the night before and leave that morning.
            </p>
          </section>
        </div>
      </Stage>

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
    </>
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
