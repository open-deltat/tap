"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, X, DoorClosed } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { Booking, Resource } from "@/lib/schemas";
import { BookingConfirmedModal, type BookingResult } from "@/components/booking-confirmed-modal";

import { ensureHotel, type HotelRoomType } from "@/app/actions/seed-hotel";
import { batchBookSlots, getBookingsForResource, cancelBooking } from "@/app/actions/bookings";
import { formatError } from "@/lib/format-error";

const DAY = 86_400_000;

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** A range of whole days: start = check-in 00:00, end = check-out 00:00 (half-open). */
function rangeMs(range: DateRange | undefined): { start: number; end: number } | null {
  if (!range?.from) return null;
  const from = new Date(range.from);
  from.setHours(0, 0, 0, 0);
  const start = from.getTime();
  // A single picked day means a one-night stay (check out the next morning).
  const toDate = range.to ?? range.from;
  const to = new Date(toDate);
  to.setHours(0, 0, 0, 0);
  const end = Math.max(start + DAY, to.getTime());
  return { start, end };
}

interface TypeState {
  reservations: Booking[]; // bookings overlapping the selected window
  remaining: number;
}

// Construct the minimal demo Resource the shared modal needs to render capacity.
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
  const [state, setState] = useState<Record<string, TypeState>>({});
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [range, setRange] = useState<DateRange | undefined>({
    from: today,
    to: new Date(today.getTime() + 2 * DAY),
  });
  const [guest, setGuest] = useState("");
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);

  const win = rangeMs(range);
  const nights = win ? Math.round((win.end - win.start) / DAY) : 0;

  const refresh = useCallback(
    async (rooms: HotelRoomType[], start: number, end: number) => {
      const entries = await Promise.all(
        rooms.map(async (rt) => {
          const all = await getBookingsForResource(rt.id);
          // A unit is consumed for this window if its booking overlaps [check-in, check-out).
          const reservations = all.filter((b) => b.start < end && b.end > start);
          const remaining = Math.max(0, rt.capacity - reservations.length);
          return [rt.id, { reservations, remaining }] as const;
        })
      );
      setState(Object.fromEntries(entries));
    },
    []
  );

  useEffect(() => {
    (async () => {
      try {
        const rooms = await ensureHotel();
        setTypes(rooms);
        if (win) await refresh(rooms, win.start, win.end);
      } catch {
        toast.error("Failed to connect to deltat. Is it running?");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickRange(next: DateRange | undefined) {
    setRange(next);
    const w = rangeMs(next);
    if (w && types.length) startTransition(() => void refresh(types, w.start, w.end));
  }

  function book(rt: HotelRoomType) {
    if (!win) return;
    const { start, end } = win;
    const label = guest.trim() ? `${guest.trim()} · ${nights}-night stay` : `${nights}-night stay`;
    startTransition(async () => {
      try {
        const created = await batchBookSlots([{ resourceId: rt.id, start, end, label }]);
        setBookingResult({
          title: `${rt.name} · ${nights} night${nights > 1 ? "s" : ""}`,
          subtitle: `${fmtDate(start)} → ${fmtDate(end)}`,
          bookings: created,
          resources: [asResource(rt)],
        });
        setGuest("");
        await refresh(types, start, end);
      } catch (err) {
        toast.error(formatError((err as Error).message) ?? "Sold out for those dates");
        await refresh(types, start, end);
      }
    });
  }

  function release(b: Booking) {
    if (!win) return;
    const { start, end } = win;
    startTransition(async () => {
      try {
        await cancelBooking(b.id);
        await refresh(types, start, end);
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

  const windowLabel = win ? `${fmtDate(win.start)} → ${fmtDate(win.end)}` : "Pick dates";

  return (
    <div className="flex h-full flex-col bg-[#0a0a0c] text-zinc-100">
      <div className="shrink-0 pb-3 pt-6 text-center">
        <div className="text-sm font-medium text-zinc-300">Grand Hotel</div>
        <div className="mt-1.5 flex items-center justify-center gap-2 text-[10.5px] uppercase tracking-[0.2em] text-zinc-500">
          <span>Capacity sweep · fungible room-types</span>
          <span className="rounded border border-white/10 px-1 py-px font-mono text-[9px] tracking-normal text-zinc-500">
            AVAIL-04
          </span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-px overflow-hidden bg-white/[0.06] lg:grid-cols-2">
        {/* Manage pane — visual floor plan */}
        <section className="flex min-h-0 flex-col overflow-auto bg-[#0a0a0c] p-6">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">Front desk</h2>
          <p className="mb-4 text-xs text-zinc-500">
            Floor plan for {windowLabel}. Each door is one room of that type; the engine&apos;s
            sweep blocks the (N+1)th overlapping stay.
          </p>
          <div className="space-y-5">
            {types.map((rt) => {
              const s = state[rt.id];
              const reservations = s?.reservations ?? [];
              const used = reservations.length;
              // One door per unit of capacity: booked doors first (carrying their label),
              // then the free remainder.
              return (
                <div key={rt.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-medium text-zinc-200">{rt.name}</div>
                    <div className="font-mono text-xs text-zinc-400">
                      {used}/{rt.capacity} booked
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: rt.capacity }).map((_, i) => {
                      const res = reservations[i];
                      const occupied = res != null;
                      return (
                        <div
                          key={i}
                          className={cn(
                            "relative flex h-20 w-24 flex-col justify-between rounded-md border p-2 transition-colors",
                            occupied
                              ? "border-rose-500/40 bg-rose-500/10"
                              : "border-emerald-500/40 bg-emerald-500/10"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <DoorClosed
                              className={cn(
                                "h-4 w-4",
                                occupied ? "text-rose-300" : "text-emerald-300"
                              )}
                            />
                            {occupied && (
                              <button
                                type="button"
                                onClick={() => release(res)}
                                disabled={isPending}
                                className="text-rose-300/70 transition-colors hover:text-rose-200"
                                aria-label="Cancel reservation"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          <div
                            className={cn(
                              "truncate text-[10px] leading-tight",
                              occupied ? "text-rose-200" : "text-emerald-300/80"
                            )}
                            title={occupied ? res.label ?? "Reserved" : "Available"}
                          >
                            {occupied ? res.label || "Reserved" : "Available"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Book pane — calendar range + room types */}
        <section className="flex min-h-0 flex-col overflow-auto bg-[#0a0a0c] p-6">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">Reserve a stay</h2>
          <p className="mb-4 text-xs text-zinc-500">
            Pick check-in → check-out, then book a room type.
          </p>

          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2 [color-scheme:dark]">
              <Calendar
                mode="range"
                selected={range}
                onSelect={pickRange}
                numberOfMonths={1}
                disabled={{ before: today }}
                className="text-zinc-100"
              />
            </div>
            <div className="flex flex-1 flex-col gap-3">
              <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-zinc-400">
                <div className="text-zinc-300">{windowLabel}</div>
                <div className="mt-0.5 text-zinc-500">
                  {nights > 0 ? `${nights} night${nights > 1 ? "s" : ""}` : "Select a check-out date"}
                </div>
              </div>
              <label className="flex flex-col gap-1 text-xs text-zinc-400">
                Guest (optional)
                <Input
                  value={guest}
                  onChange={(e) => setGuest(e.target.value)}
                  placeholder="Name on the reservation"
                  className="border-white/10 bg-white/5 text-sm text-zinc-100 placeholder:text-zinc-600 [color-scheme:dark]"
                />
              </label>
            </div>
          </div>

          <div className="space-y-3">
            {types.map((rt) => {
              const s = state[rt.id];
              const remaining = s?.remaining ?? rt.capacity;
              const free = remaining > 0 && nights > 0;
              return (
                <div
                  key={rt.id}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] p-4"
                >
                  <div>
                    <div className="text-sm font-semibold text-zinc-100">{rt.name}</div>
                    <div className="text-xs text-zinc-500">
                      {remaining > 0
                        ? `${remaining} of ${rt.capacity} available`
                        : "Sold out for these dates"}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={isPending || !free}
                    onClick={() => book(rt)}
                    className="bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-40"
                  >
                    {nights > 0 ? `Book ${nights} night${nights > 1 ? "s" : ""}` : "Book"}
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <BookingConfirmedModal
        result={bookingResult}
        onClose={() => setBookingResult(null)}
        onBookAnother={() => setBookingResult(null)}
      />
    </div>
  );
}
