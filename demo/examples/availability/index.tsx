"use client";

import { useEffect, useState, useCallback, useTransition, useMemo } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Stage } from "@/components/stage";
import { BookButton } from "@/components/book-button";
import { PILL_ACTIVE } from "@/lib/accent";
import { BookingConfirmedModal, type BookingResult } from "@/components/booking-confirmed-modal";
import { NextAvailability } from "@/components/next-availability";
import { formatTime, dayBounds } from "@/lib/time";
import { formatError } from "@/lib/format-error";
import type { AvailabilitySlot, Resource } from "@/lib/schemas";

import { seedAvailabilityScheduler } from "./seed";
import { getAvailability } from "@/app/actions/availability";
import { bookSlot } from "@/app/actions/bookings";
import { useWebSocket } from "@/hooks/use-websocket";

const SLOT_MS = 30 * 60_000;
const NAME = "Dr. Sarah Chen";
const WINDOW_DAYS = 21;
const midnight = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};

function asResource(id: string): Resource {
  return {
    id,
    parentId: null,
    name: NAME,
    capacity: 1,
    bufferAfter: null,
    slotMinutes: 30,
    price: null,
    bufferMinutes: 0,
  };
}

export default function AvailabilityExample() {
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [date, setDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  // Controlled calendar month, so jumping to a future opening also moves the visible month.
  const [month, setMonth] = useState<Date>(date);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [selected, setSelected] = useState<{ start: number; end: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BookingResult | null>(null);

  const [availableDays, setAvailableDays] = useState<Set<number>>(new Set());

  const { windowStart, windowEnd } = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + WINDOW_DAYS - 1);
    return { windowStart: start, windowEnd: end };
  }, []);
  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowEnd.getTime() + 86_400_000;

  // Which days across the window have any bookable slot, used to grey out empty days (weekends,
  // blocked days) in the picker so you can't land on a day with nothing open.
  const loadAvailableDays = useCallback(
    async (id: string): Promise<Set<number>> => {
      const raw = await getAvailability(id, windowStartMs, windowEndMs);
      const days = new Set<number>();
      for (const s of raw) if (s.end - s.start >= SLOT_MS) days.add(midnight(new Date(s.start)));
      setAvailableDays(days);
      return days;
    },
    [windowStartMs, windowEndMs]
  );

  const loadSlots = useCallback(async (id: string, d: Date) => {
    const { dayStart, dayEnd } = dayBounds(d);
    setSlotsLoading(true);
    try {
      const raw = await getAvailability(id, dayStart, dayEnd);
      const expanded: AvailabilitySlot[] = [];
      for (const s of raw) {
        let cursor = s.start;
        while (cursor + SLOT_MS <= s.end) {
          expanded.push({ start: cursor, end: cursor + SLOT_MS });
          cursor += SLOT_MS;
        }
      }
      setSlots(expanded);
      // Default-select the first slot so the day never reads as empty.
      setSelected((prev) => {
        if (prev && expanded.some((s) => s.start === prev.start)) return prev;
        return expanded.length > 0 ? { start: expanded[0].start, end: expanded[0].end } : null;
      });
    } catch {
      setSlots([]);
      setSelected(null);
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  useEffect(() => {
    seedAvailabilityScheduler()
      .then(async (id) => {
        setResourceId(id);
        // Stay on today. If today has nothing open, the slot panel shows an explicit
        // "next opening" action rather than silently moving the date.
        await Promise.all([loadAvailableDays(id), loadSlots(id, date)]);
      })
      .catch(() => toast.error("Failed to connect to Δt. Is it running?"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resourceId) loadSlots(resourceId, date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, resourceId]);

  const onWsEvent = useCallback(() => {
    if (resourceId) {
      loadSlots(resourceId, date);
      loadAvailableDays(resourceId);
    }
  }, [resourceId, date, loadSlots, loadAvailableDays]);
  useWebSocket(resourceId ? { type: "subscribe", resourceId, onEvent: onWsEvent } : null);

  const isDayDisabled = (day: Date) => {
    const m = midnight(day);
    if (m < windowStartMs || m >= windowEndMs) return true;
    return availableDays.size > 0 && !availableDays.has(m);
  };

  function confirm() {
    if (!selected || !resourceId) return;
    const d = date;
    const rid = resourceId;
    startTransition(async () => {
      try {
        const booking = await bookSlot({
          resourceId: rid,
          start: selected.start,
          end: selected.end,
          label: "Appointment",
        });
        setResult({
          title: `Appointment · ${NAME}`,
          subtitle: `${formatTime(selected.start)} to ${formatTime(selected.end)}`,
          bookings: [booking],
          resources: [asResource(rid)],
        });
        await loadSlots(rid, d);
      } catch (err) {
        toast.error(formatError(err instanceof Error ? err.message : String(err)));
        await loadSlots(rid, d);
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

  const dateLabel = date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const tray = selected ? (
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm text-zinc-300">
        <span className="text-zinc-500">{dateLabel}</span> · {formatTime(selected.start)} to {formatTime(selected.end)}
      </div>
      <BookButton onClick={confirm} loading={isPending}>
        Book appointment
      </BookButton>
    </div>
  ) : undefined;

  return (
    <>
      <Stage primitive={{ label: "Free time is open hours minus busy", specId: "AVAIL-01" }} title={NAME} contentMax="max-w-3xl" tray={tray}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[auto_1fr]">
          {/* Date picker: greyed days have nothing open */}
          <div className="sm:border-r sm:border-white/[0.06] sm:pr-5 [color-scheme:dark]">
            <Calendar
              mode="single"
              required
              selected={date}
              onSelect={(d) => {
                if (!d) return;
                const next = new Date(d);
                next.setHours(0, 0, 0, 0);
                setDate(next);
              }}
              month={month}
              onMonthChange={setMonth}
              startMonth={windowStart}
              disabled={isDayDisabled}
              className="bg-transparent text-zinc-100"
            />
          </div>

          {/* That day's 30-min slots */}
          <div className="flex min-h-[24rem] flex-col">
            <div className="mb-3 flex items-baseline justify-between">
              <div className="text-sm font-medium text-zinc-200">{dateLabel}</div>
              {slots.length > 0 && <div className="text-[11px] text-zinc-500">{slots.length} open</div>}
            </div>

            <div className="relative flex-1">
              {slotsLoading ? (
                <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Loading…
                </div>
              ) : slots.length === 0 ? (
                resourceId && (
                  <NextAvailability
                    resourceIds={[resourceId]}
                    from={date}
                    title="Dr. Chen has nothing open today."
                    minDurationMs={SLOT_MS}
                    // Cap the search at the calendar's enabled window so a jump never lands on a greyed-out day.
                    horizonDays={Math.max(1, Math.ceil((windowEndMs - date.getTime()) / 86_400_000))}
                    onJump={(o) => {
                      const d = new Date(o.start);
                      d.setHours(0, 0, 0, 0);
                      setDate(d);
                      setMonth(d);
                    }}
                  />
                )
              ) : (
                <div className="grid max-h-[22rem] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                  {slots.map((s) => {
                    const active = selected?.start === s.start;
                    return (
                      <button
                        key={s.start}
                        onClick={() => setSelected({ start: s.start, end: s.end })}
                        className={cn(
                          "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? PILL_ACTIVE
                            : "border-white/10 text-zinc-300 hover:border-emerald-400/30 hover:bg-white/[0.04]"
                        )}
                      >
                        {formatTime(s.start)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </Stage>

      <BookingConfirmedModal
        result={result}
        onClose={() => setResult(null)}
        onBookAnother={() => setResult(null)}
      />
    </>
  );
}
