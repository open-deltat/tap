"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Segmented } from "@/components/ui/segmented";
import { WeekTimeline, type WeekRow, type DayState } from "@/components/week-timeline";
import { formatTime } from "@/lib/time";
import { getAvailability, getCombinedAvailability } from "@/app/actions/availability";

const DAY = 86_400_000;
const HORIZON_DAYS = 21; // three weeks ahead
const SLOT_STEP_MS = 30 * 60_000;
const DURATIONS = [90, 120, 150]; // minutes
const durationLabel = (m: number) => (m % 60 === 0 ? `${m / 60} hr` : `${(m / 60).toFixed(1)} hr`);

interface Grid {
  start: Date;
  friends: DayState[][];
  windowByDay: ({ start: number; end: number } | undefined)[]; // the largest shared evening window per day
}

// Five friends, five calendars, three weeks: each friend's evenings day by day, the row where all
// five line up, then a time picker on the chosen evening. The chosen time is reported up via
// onPendingChange so the page's shared bottom tray is the booker (same place as every example).
export function DinnerFinder({
  resourceIds,
  onPendingChange,
  onInteract,
  reloadKey,
}: {
  resourceIds: string[];
  onPendingChange: (p: { start: number; end: number } | null) => void;
  /** Called when the user touches this finder, so the page can point the tray at the dinner flow. */
  onInteract: () => void;
  /** Bumped by the page after a successful dinner booking to re-read the grid. */
  reloadKey: number;
}) {
  const [grid, setGrid] = useState<Grid | null>(null);
  const [loading, setLoading] = useState(true);
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

    // Largest shared window per day, regardless of duration — the "Everyone" row and the open count
    // are derived from these at render time, so they react to the duration toggle.
    const windowByDay: ({ start: number; end: number } | undefined)[] = Array.from({ length: HORIZON_DAYS });
    for (const s of combined) {
      const i = dayIndex(s.start);
      if (i < 0 || i >= HORIZON_DAYS) continue;
      const cur = windowByDay[i];
      if (!cur || s.end - s.start > cur.end - cur.start) windowByDay[i] = { start: s.start, end: s.end };
    }

    setGrid({ start, friends, windowByDay });
  }, [resourceIds]);

  useEffect(() => {
    load()
      .catch(() => toast.error("Failed to connect to Δt. Is it running?"))
      .finally(() => setLoading(false));
  }, [load, reloadKey]);

  const durMs = duration * 60_000;

  const everyoneStates = useMemo<DayState[]>(
    () => (grid ? grid.windowByDay.map((w) => (w && w.end - w.start >= durMs ? "free" : "busy")) : []),
    [grid, durMs]
  );

  const dayWindow = selectedDay != null ? grid?.windowByDay[selectedDay] : undefined;
  const fits = !!dayWindow && dayWindow.end - dayWindow.start >= durMs;

  const startOptions = useMemo(() => {
    if (!dayWindow) return [];
    const out: number[] = [];
    for (let t = dayWindow.start; t + durMs <= dayWindow.end; t += SLOT_STEP_MS) out.push(t);
    return out;
  }, [dayWindow, durMs]);

  const activeStart = selectedStart != null && startOptions.includes(selectedStart) ? selectedStart : startOptions[0] ?? null;

  // Report the bookable pick up to the page's shared tray (the global booker).
  useEffect(() => {
    onPendingChange(activeStart != null ? { start: activeStart, end: activeStart + durMs } : null);
  }, [activeStart, durMs, onPendingChange]);

  const rows = useMemo<WeekRow[]>(() => {
    if (!grid) return [];
    return [
      ...grid.friends.map((states, i) => ({ label: `Friend ${i + 1}`, states })),
      { label: "Everyone", states: everyoneStates, result: true },
    ];
  }, [grid, everyoneStates]);

  const openCount = everyoneStates.filter((s) => s === "free").length;
  const dayLabel = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-center text-sm font-medium text-zinc-100">Dinner with five friends</div>
      <p className="mx-auto mt-1 max-w-lg text-center text-[12px] leading-relaxed text-zinc-400">
        The bottom row is when all five are free at the same time. Pick a length, a green{" "}
        <span className="text-emerald-300">Everyone</span> day, then a time.
      </p>

      <div className="mt-5">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking five calendars…
          </div>
        ) : grid ? (
          <>
            <div className="mb-3 flex items-center justify-center gap-2">
              <span className="text-[11px] text-zinc-500">Dinner length</span>
              <Segmented
                items={DURATIONS.map((m) => ({ value: m, label: durationLabel(m) }))}
                value={duration}
                onChange={(m) => {
                  onInteract();
                  setDuration(m);
                }}
                ariaLabel="Dinner length"
              />
            </div>

            <WeekTimeline
              start={grid.start}
              dayCount={HORIZON_DAYS}
              rows={rows}
              onPick={(i) => {
                onInteract();
                setSelectedDay(i);
              }}
              selectedDay={selectedDay ?? undefined}
              labelWidth={52}
            />
            <div className="mt-2 text-center text-[11px] text-zinc-500">
              {openCount > 0
                ? `${openCount} evening${openCount > 1 ? "s" : ""} fit a ${durationLabel(duration)} dinner for all five`
                : `No evening fits a ${durationLabel(duration)} dinner for all five in the next three weeks`}
            </div>

            {dayWindow && (
              <div className="mt-4 rounded-lg border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="text-sm font-medium text-zinc-100">{dayLabel(dayWindow.start)}</div>
                <div className="text-[12px] text-zinc-400">
                  All five free {formatTime(dayWindow.start)} to {formatTime(dayWindow.end)}
                </div>

                {fits ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {startOptions.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          onInteract();
                          setSelectedStart(t);
                        }}
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
                ) : (
                  <div className="mt-3 text-[12px] text-amber-300/80">
                    Only {Math.round((dayWindow.end - dayWindow.start) / 60_000)} min where all five overlap that
                    evening, too short for a {durationLabel(duration)} dinner. Try a shorter length.
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
