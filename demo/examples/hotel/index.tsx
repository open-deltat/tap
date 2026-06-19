"use client";

import { useEffect, useMemo, useState, useTransition, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { Booking, Resource } from "@/lib/schemas";
import { BookingConfirmedModal, type BookingResult } from "@/components/booking-confirmed-modal";

import { ensureHotel, type HotelRoomType } from "./seed";
import { batchBookSlots, getBookingsForResource, cancelBooking } from "@/app/actions/bookings";
import { formatError } from "@/lib/format-error";
import { bookedNightSets } from "./occupancy";

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
  all: Booking[]; // every booking for this type (drives the occupancy calendar)
  remaining: number; // units free for the selected window (drives the book pane)
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
  // The occupancy calendars open on the month the manager is currently booking into.
  const defaultMonth = useMemo(() => new Date(win?.start ?? Date.now()), [win?.start]);

  const refresh = useCallback(
    async (rooms: HotelRoomType[], start: number, end: number) => {
      const entries = await Promise.all(
        rooms.map(async (rt) => {
          const all = await getBookingsForResource(rt.id);
          // A unit is consumed for this window if its booking overlaps [check-in, check-out).
          const used = all.filter((b) => b.start < end && b.end > start).length;
          const remaining = Math.max(0, rt.capacity - used);
          return [rt.id, { all, remaining }] as const;
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
        {/* Manage pane — per-type occupancy calendars */}
        <section className="flex min-h-0 flex-col overflow-auto bg-[#0a0a0c] p-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Occupancy
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Booked nights per room type. Gaps are open inventory.
              </p>
            </div>
            <OccupancyLegend />
          </div>
          <div className="space-y-5">
            {types.map((rt) => (
              <TypeOccupancyCalendar
                key={rt.id}
                type={rt}
                bookings={state[rt.id]?.all ?? []}
                defaultMonth={defaultMonth}
                onCancel={release}
                canceling={isPending}
              />
            ))}
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

function OccupancyLegend() {
  const items = [
    { cls: "border-white/15 bg-white/[0.04]", label: "Free" },
    { cls: "border-amber-500/40 bg-amber-500/25", label: "Partial" },
    { cls: "border-rose-500/50 bg-rose-500/30", label: "Full" },
  ];
  return (
    <div className="flex shrink-0 items-center gap-3 text-[10px] text-zinc-500">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className={cn("h-3 w-3 rounded-sm border", it.cls)} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// A fully-disabled calendar never renders DayButton, so modifier classNames land on the
// day <td> alongside the disabled slot's opacity-50. Force opacity-100 (and !text) back so
// highlighted nights stay legible.
const occupancyModifierClasses = {
  full: "bg-rose-500/30 !text-rose-100 rounded-md !opacity-100",
  partial: "bg-amber-500/25 !text-amber-100 rounded-md !opacity-100",
};

function TypeOccupancyCalendar({
  type,
  bookings,
  defaultMonth,
  onCancel,
  canceling,
}: {
  type: HotelRoomType;
  bookings: Booking[];
  defaultMonth: Date;
  onCancel: (b: Booking) => void;
  canceling: boolean;
}) {
  const { full, partial } = useMemo(
    () => bookedNightSets(bookings, type.capacity),
    [bookings, type.capacity]
  );
  const bookedNights = full.length + partial.length;
  const sorted = useMemo(
    () => [...bookings].sort((a, b) => a.start - b.start),
    [bookings]
  );

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium text-zinc-200">{type.name}</div>
        <div className="font-mono text-xs text-zinc-400">
          {type.capacity} room{type.capacity > 1 ? "s" : ""}
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="rounded-md border border-white/10 bg-white/[0.02] p-2 [color-scheme:dark]">
          <Calendar
            defaultMonth={defaultMonth}
            numberOfMonths={1}
            disabled
            modifiers={{ full, partial }}
            modifiersClassNames={occupancyModifierClasses}
            className="text-zinc-100"
          />
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <div className="text-[11px] text-zinc-500">
            {bookedNights === 0
              ? "No nights booked"
              : `${bookedNights} night${bookedNights > 1 ? "s" : ""} booked` +
                (full.length > 0 ? ` · ${full.length} full` : "")}
          </div>
          {sorted.length > 0 && (
            <ul className="flex flex-col gap-1">
              {sorted.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-xs"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-zinc-300" title={b.label ?? "Reserved"}>
                      {b.label || "Reserved"}
                    </span>
                    <span className="block text-[10px] text-zinc-500">
                      {fmtDate(b.start)} → {fmtDate(b.end)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onCancel(b)}
                    disabled={canceling}
                    className="shrink-0 text-rose-300/70 transition-colors hover:text-rose-200 disabled:opacity-40"
                    aria-label="Cancel reservation"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
