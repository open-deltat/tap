"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, X, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Booking, Resource } from "@/lib/schemas";
import { BookingConfirmedModal, type BookingResult } from "@/components/booking-confirmed-modal";

import { ensureHotel, type HotelRoomType } from "./seed";
import { CHECK_IN_HOUR, CHECK_OUT_HOUR } from "./policy";
import { batchBookSlots, getBookingsForResource, cancelBooking } from "@/app/actions/bookings";
import { formatError } from "@/lib/format-error";
import { AvailabilityStrip } from "./availability-strip";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const hourLabel = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`;

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
  const [nights, setNights] = useState(2);
  const [guest, setGuest] = useState("");
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BookingResult | null>(null);

  const today = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();

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
        await refresh(rooms);
      } catch {
        toast.error("Failed to connect to deltat. Is it running?");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function book(rt: HotelRoomType, startMidnight: number, n: number) {
    // Check-in 3 PM on the first day → check-out 11 AM on the (start + n) day.
    const start = startMidnight + CHECK_IN_HOUR * HOUR;
    const end = startMidnight + n * DAY + CHECK_OUT_HOUR * HOUR;
    const label = guest.trim() ? `${guest.trim()} · ${n}-night stay` : `${n}-night stay`;
    startTransition(async () => {
      try {
        const created = await batchBookSlots([{ resourceId: rt.id, start, end, label }]);
        setResult({
          title: `${rt.name} · ${n} night${n > 1 ? "s" : ""}`,
          subtitle: `${fmt(start)} ${hourLabel(CHECK_IN_HOUR)} → ${fmt(end)} ${hourLabel(CHECK_OUT_HOUR)}`,
          bookings: created,
          resources: [asResource(rt)],
        });
        setGuest("");
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
        {/* Front desk — what's open + manage reservations */}
        <section className="flex min-h-0 flex-col overflow-auto bg-[#0a0a0c] p-6">
          <header className="mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Front desk</h2>
            <p className="mt-1 text-xs text-zinc-500">
              What&apos;s open over the next 30 nights, and for how long. <Legend />
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
                    <AvailabilityStrip capacity={rt.capacity} bookings={all} fromMs={today} />
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

        {/* Book a stay — pick a length, click an opening */}
        <section className="flex min-h-0 flex-col overflow-auto bg-[#0a0a0c] p-6">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Book a stay</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Pick a length, then click an opening — same room, no switching. Check-in{" "}
                {hourLabel(CHECK_IN_HOUR)} · check-out {hourLabel(CHECK_OUT_HOUR)}.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-zinc-500">nights</span>
              <Button size="icon" variant="ghost" className="h-6 w-6 text-zinc-300" onClick={() => setNights((n) => Math.max(1, n - 1))}>
                <Minus className="h-3 w-3" />
              </Button>
              <span className="w-4 text-center font-mono text-sm text-zinc-100">{nights}</span>
              <Button size="icon" variant="ghost" className="h-6 w-6 text-zinc-300" onClick={() => setNights((n) => Math.min(14, n + 1))}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </header>

          <label className="mb-4 flex flex-col gap-1 text-xs text-zinc-400">
            Guest (optional)
            <Input
              value={guest}
              onChange={(e) => setGuest(e.target.value)}
              placeholder="Name on the reservation"
              className="border-white/10 bg-white/5 text-sm text-zinc-100 placeholder:text-zinc-600"
            />
          </label>

          <div className="space-y-5">
            {types.map((rt) => (
              <div key={rt.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                <RoomHeader rt={rt} />
                <div className="mt-3">
                  <AvailabilityStrip
                    capacity={rt.capacity}
                    bookings={bookingsByType[rt.id] ?? []}
                    fromMs={today}
                    minNights={nights}
                    onPick={(start, n) => book(rt, start, n)}
                  />
                </div>
              </div>
            ))}
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
    { cls: "bg-rose-500/50", label: "booked room" },
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
