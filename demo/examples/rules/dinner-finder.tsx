"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { BookingConfirmedModal, type BookingResult } from "@/components/booking-confirmed-modal";
import { WeekTimeline, type WeekRow, type DayState } from "@/components/week-timeline";
import type { Resource } from "@/lib/schemas";
import { formatTime } from "@/lib/time";
import { formatError } from "@/lib/format-error";
import { getAvailability, getCombinedAvailability } from "@/app/actions/availability";
import { batchBookSlots } from "@/app/actions/bookings";

const DAY = 86_400_000;
const HORIZON_DAYS = 21; // three weeks ahead
const MIN_DINNER_MS = 2 * 60 * 60_000; // a dinner needs at least a 2h window all five share

interface Grid {
  start: Date;
  friends: DayState[][]; // per friend, one state per day
  everyone: DayState[]; // the intersection
  slotByDay: ({ start: number; end: number } | undefined)[]; // the bookable window per day, if any
}

// Five friends, five calendars, three weeks: show each friend's evenings day by day, plus the row
// where all five line up. Booking a green "Everyone" day reserves that evening on every calendar.
export function DinnerFinder({ resourceIds, resources }: { resourceIds: string[]; resources: Resource[] }) {
  const [grid, setGrid] = useState<Grid | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BookingResult | null>(null);

  const load = useCallback(async () => {
    if (resourceIds.length === 0) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    const endMs = startMs + HORIZON_DAYS * DAY;
    const dayIndex = (ms: number) => Math.floor((ms - startMs) / DAY);

    const [perFriend, combined] = await Promise.all([
      Promise.all(resourceIds.map((id) => getAvailability(id, startMs, endMs))),
      getCombinedAvailability(resourceIds, startMs, endMs, resourceIds.length),
    ]);

    const friends: DayState[][] = perFriend.map((slots) => {
      const free = new Set(slots.map((s) => dayIndex(s.start)));
      return Array.from({ length: HORIZON_DAYS }, (_, i) => (free.has(i) ? "free" : "busy"));
    });

    const slotByDay: ({ start: number; end: number } | undefined)[] = Array.from({ length: HORIZON_DAYS });
    for (const s of combined) {
      if (s.end - s.start < MIN_DINNER_MS) continue;
      const i = dayIndex(s.start);
      if (i >= 0 && i < HORIZON_DAYS && !slotByDay[i]) slotByDay[i] = { start: s.start, end: s.end };
    }
    const everyone: DayState[] = Array.from({ length: HORIZON_DAYS }, (_, i) => (slotByDay[i] ? "free" : "busy"));

    setGrid({ start, friends, everyone, slotByDay });
  }, [resourceIds]);

  useEffect(() => {
    load()
      .catch(() => toast.error("Failed to connect to deltat. Is it running?"))
      .finally(() => setLoading(false));
  }, [load]);

  function book(dayIndex: number) {
    const slot = grid?.slotByDay[dayIndex];
    if (!slot) return;
    startTransition(async () => {
      try {
        const created = await batchBookSlots(
          resourceIds.map((id) => ({ resourceId: id, start: slot.start, end: slot.end, label: "Dinner" }))
        );
        const d = new Date(slot.start);
        setResult({
          title: "Dinner booked",
          subtitle: `${d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} · ${formatTime(slot.start)} to ${formatTime(slot.end)}`,
          bookings: created,
          resources,
        });
        await load();
      } catch (err) {
        toast.error(formatError(err instanceof Error ? err.message : String(err)));
      }
    });
  }

  const rows = useMemo<WeekRow[]>(() => {
    if (!grid) return [];
    return [
      ...grid.friends.map((states, i) => ({ label: `Friend ${i + 1}`, states })),
      { label: "Everyone", states: grid.everyone, result: true },
    ];
  }, [grid]);

  const openCount = grid?.everyone.filter((s) => s === "free").length ?? 0;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-center text-sm font-medium text-zinc-100">Dinner with five friends</div>
      <p className="mx-auto mt-1 max-w-lg text-center text-[12px] leading-relaxed text-zinc-400">
        Each friend&apos;s evenings over the next three weeks, and the row where all five line up. One
        query intersects five calendars with <span className="text-emerald-300">min_available = 5</span>.
        Click a green <span className="text-emerald-300">Everyone</span> day to book the evening on every
        calendar.
      </p>

      <div className="mt-5">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking five calendars…
          </div>
        ) : grid ? (
          <>
            <WeekTimeline start={grid.start} dayCount={HORIZON_DAYS} rows={rows} onPick={isPending ? undefined : book} labelWidth={52} />
            <div className="mt-2 text-center text-[11px] text-zinc-500">
              {openCount > 0
                ? `${openCount} evening${openCount > 1 ? "s" : ""} where all five are free`
                : "No evening works for all five in the next three weeks"}
            </div>
          </>
        ) : null}
      </div>

      <BookingConfirmedModal result={result} onClose={() => setResult(null)} onBookAnother={() => setResult(null)} />
    </div>
  );
}
