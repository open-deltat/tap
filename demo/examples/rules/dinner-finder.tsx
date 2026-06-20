"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BookingConfirmedModal, type BookingResult } from "@/components/booking-confirmed-modal";
import { WeekTimeline, type WeekRow, type DayState } from "@/components/week-timeline";
import type { Resource } from "@/lib/schemas";
import { formatTime } from "@/lib/time";
import { formatError } from "@/lib/format-error";
import { getAvailability, getCombinedAvailability } from "@/app/actions/availability";
import { batchBookSlots } from "@/app/actions/bookings";

const DAY = 86_400_000;
const HORIZON_DAYS = 21; // three weeks ahead
const MIN_DINNER_MS = 2 * 60 * 60_000; // a window has to fit at least a 2h dinner
const SLOT_STEP_MS = 30 * 60_000;
const DURATIONS = [90, 120, 150]; // minutes
const durationLabel = (m: number) => (m % 60 === 0 ? `${m / 60} hr` : `${(m / 60).toFixed(1)} hr`);

interface Grid {
  start: Date;
  friends: DayState[][];
  everyone: DayState[];
  windowByDay: ({ start: number; end: number } | undefined)[]; // the shared evening window per day
}

// Five friends, five calendars, three weeks: each friend's evenings day by day, the row where all
// five line up, then a time picker on the chosen evening so you book an actual range, not just "a night".
export function DinnerFinder({ resourceIds, resources }: { resourceIds: string[]; resources: Resource[] }) {
  const [grid, setGrid] = useState<Grid | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BookingResult | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [duration, setDuration] = useState(120);
  const [selectedStart, setSelectedStart] = useState<number | null>(null);

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

    const windowByDay: ({ start: number; end: number } | undefined)[] = Array.from({ length: HORIZON_DAYS });
    for (const s of combined) {
      if (s.end - s.start < MIN_DINNER_MS) continue;
      const i = dayIndex(s.start);
      if (i >= 0 && i < HORIZON_DAYS && !windowByDay[i]) windowByDay[i] = { start: s.start, end: s.end };
    }
    const everyone: DayState[] = Array.from({ length: HORIZON_DAYS }, (_, i) => (windowByDay[i] ? "free" : "busy"));

    setGrid({ start, friends, everyone, windowByDay });
  }, [resourceIds]);

  useEffect(() => {
    load()
      .catch(() => toast.error("Failed to connect to deltat. Is it running?"))
      .finally(() => setLoading(false));
  }, [load]);

  const window = selectedDay != null ? grid?.windowByDay[selectedDay] : undefined;

  // Discrete dinner start times that fit `duration` inside the chosen evening's shared window.
  const startOptions = useMemo(() => {
    if (!window) return [];
    const durMs = duration * 60_000;
    const out: number[] = [];
    for (let t = window.start; t + durMs <= window.end; t += SLOT_STEP_MS) out.push(t);
    return out;
  }, [window, duration]);

  // The effective pick is the user's choice if it still fits the current options, else the first slot
  // — derived during render rather than synced through an effect.
  const activeStart = selectedStart != null && startOptions.includes(selectedStart) ? selectedStart : startOptions[0] ?? null;

  function book() {
    if (activeStart == null) return;
    const start = activeStart;
    const end = start + duration * 60_000;
    startTransition(async () => {
      try {
        const created = await batchBookSlots(resourceIds.map((id) => ({ resourceId: id, start, end, label: "Dinner" })));
        const d = new Date(start);
        setResult({
          title: "Dinner booked",
          subtitle: `${d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} · ${formatTime(start)} to ${formatTime(end)}`,
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
  const dayLabel = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-center text-sm font-medium text-zinc-100">Dinner with five friends</div>
      <p className="mx-auto mt-1 max-w-lg text-center text-[12px] leading-relaxed text-zinc-400">
        Each friend&apos;s evenings over the next three weeks, and the row where all five line up
        (<span className="text-emerald-300">min_available = 5</span>). Pick a green{" "}
        <span className="text-emerald-300">Everyone</span> day, then choose a time.
      </p>

      <div className="mt-5">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking five calendars…
          </div>
        ) : grid ? (
          <>
            <WeekTimeline
              start={grid.start}
              dayCount={HORIZON_DAYS}
              rows={rows}
              onPick={(i) => setSelectedDay(i)}
              selectedDay={selectedDay ?? undefined}
              labelWidth={52}
            />
            <div className="mt-2 text-center text-[11px] text-zinc-500">
              {openCount > 0
                ? `${openCount} evening${openCount > 1 ? "s" : ""} where all five are free`
                : "No evening works for all five in the next three weeks"}
            </div>

            {window && (
              <div className="mt-4 rounded-lg border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="text-sm font-medium text-zinc-100">{dayLabel(window.start)}</div>
                <div className="text-[12px] text-zinc-400">
                  All five free {formatTime(window.start)} to {formatTime(window.end)}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[11px] text-zinc-500">Length</span>
                  <div className="flex items-center gap-1 rounded-full border border-white/10 p-0.5">
                    {DURATIONS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setDuration(m)}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] transition-colors",
                          duration === m ? "bg-emerald-400/15 text-emerald-200" : "text-zinc-400 hover:text-zinc-200"
                        )}
                      >
                        {durationLabel(m)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {startOptions.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSelectedStart(t)}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                        activeStart === t
                          ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-200"
                          : "border-white/10 text-zinc-300 hover:border-emerald-400/30 hover:bg-white/[0.04]"
                      )}
                    >
                      {formatTime(t)}
                    </button>
                  ))}
                </div>

                {activeStart != null && (
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
                    <div className="text-sm text-zinc-300">
                      {formatTime(activeStart)} to {formatTime(activeStart + duration * 60_000)}
                    </div>
                    <Button
                      onClick={book}
                      disabled={isPending}
                      className="h-10 px-6 text-sm font-semibold bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-400"
                    >
                      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Book dinner"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>

      <BookingConfirmedModal result={result} onClose={() => setResult(null)} onBookAnother={() => setResult(null)} />
    </div>
  );
}
