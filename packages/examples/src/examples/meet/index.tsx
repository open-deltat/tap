"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Stage } from "../../components/stage";
import { Segmented } from "../../components/ui/segmented";
import { BookButton } from "../../components/book-button";
import { WeekTimeline, type WeekRow, type DayState } from "../../components/week-timeline";
import { MeetLanes } from "./meet-lanes";
import { BookingConfirmedModal, type BookingResult } from "../../components/booking-confirmed-modal";
import type { AvailabilitySlot, Resource } from "../../lib/schemas";
import { formatTime } from "@open-deltat/shared/time";

import { ensureMeetFriends } from "./seed";
import { getAvailability, getCombinedAvailability } from "../../actions/availability";
import { batchBookSlots } from "../../actions/bookings";
import { useWebSocket } from "../../hooks/use-websocket";
import { formatError } from "../../lib/format-error";

const H = 3_600_000;
const DAY = 86_400_000;
const HORIZON_DAYS = 21; // three weeks to scan
const SLOT_STEP_MS = 30 * 60_000;
const AXIS_START_HOUR = 16;
const AXIS_END_HOUR = 24;
const DURATIONS = [90, 120, 150] as const;
type Duration = (typeof DURATIONS)[number];
const durationLabel = (m: number) => (m % 60 === 0 ? `${m / 60} hr` : `${(m / 60).toFixed(1)} hr`);

interface DayWindow {
  start: number;
  end: number;
}
interface Grid {
  start: Date;
  friends: DayState[][]; // per friend, free/busy per day
  windowByDay: (DayWindow | undefined)[]; // largest shared window per day
  perFriendSlots: AvailabilitySlot[][]; // per friend, free windows across the horizon
  combined: AvailabilitySlot[]; // every shared window across the horizon
}

function asResource(id: string, name: string): Resource {
  return { id, parentId: null, name, capacity: 1, bufferAfter: null, slotMinutes: 30, price: null, bufferMinutes: 0 };
}

const dayLabel = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

export default function MeetExample() {
  const [ids, setIds] = useState<string[] | null>(null);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [duration, setDuration] = useState<Duration>(120);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedStart, setSelectedStart] = useState<number | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const durMs = duration * 60_000;

  const load = useCallback(async (friendIds: string[]) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    const endMs = startMs + HORIZON_DAYS * DAY;
    const dayIndex = (ms: number) => Math.floor((ms - startMs) / DAY);

    const [perFriendSlots, combined] = await Promise.all([
      Promise.all(friendIds.map((id) => getAvailability(id, startMs, endMs))),
      // min_available = all friends → the intersection: every evening they are all free at once.
      getCombinedAvailability(friendIds, startMs, endMs, friendIds.length),
    ]);

    const friends: DayState[][] = perFriendSlots.map((slots) => {
      const free = new Set(slots.map((s) => dayIndex(s.start)));
      return Array.from({ length: HORIZON_DAYS }, (_, i) => (free.has(i) ? "free" : "busy"));
    });

    // Largest shared window per day, the "Everyone" row and its day count derive from these, so they
    // react to the duration toggle without re-reading.
    const windowByDay: (DayWindow | undefined)[] = Array.from({ length: HORIZON_DAYS });
    for (const s of combined) {
      const i = dayIndex(s.start);
      if (i < 0 || i >= HORIZON_DAYS) continue;
      const cur = windowByDay[i];
      if (!cur || s.end - s.start > cur.end - cur.start) windowByDay[i] = { start: s.start, end: s.end };
    }

    setGrid({ start, friends, windowByDay, perFriendSlots, combined });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const friendIds = await ensureMeetFriends();
        setIds(friendIds);
        await load(friendIds);
      } catch {
        toast.error("Failed to connect to Δt. Is it running?");
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  // Live: re-read the grid on any booking/cancel from any of the five calendars.
  const reload = useCallback(() => {
    if (ids && !isPending) void load(ids);
  }, [ids, isPending, load]);
  useWebSocket(ids?.[0] ? { type: "subscribe", resourceId: ids[0], onEvent: reload } : null);
  useWebSocket(ids?.[1] ? { type: "subscribe", resourceId: ids[1], onEvent: reload } : null);
  useWebSocket(ids?.[2] ? { type: "subscribe", resourceId: ids[2], onEvent: reload } : null);
  useWebSocket(ids?.[3] ? { type: "subscribe", resourceId: ids[3], onEvent: reload } : null);
  useWebSocket(ids?.[4] ? { type: "subscribe", resourceId: ids[4], onEvent: reload } : null);

  // The chosen evening: each friend's free band that night plus every shared window, sliced from the
  // horizon data already loaded (no extra read).
  const detail = useMemo(() => {
    if (!grid || selectedDay == null) return null;
    const ds = new Date(grid.start);
    ds.setDate(ds.getDate() + selectedDay);
    const dayStart = ds.getTime();
    const dayEnd = dayStart + DAY;
    const inDay = (s: AvailabilitySlot) => s.start < dayEnd && s.end > dayStart;
    const clamp = (s: AvailabilitySlot) => ({ start: Math.max(s.start, dayStart), end: Math.min(s.end, dayEnd) });
    const friendLanes = grid.perFriendSlots.map((slots, i) => ({
      label: `Friend ${i + 1}`,
      slots: slots.filter(inDay).map(clamp),
    }));
    const shared = grid.combined.filter(inDay).map(clamp);
    return { dayStart, friendLanes, shared };
  }, [grid, selectedDay]);

  // Discrete bookable start times within the shared windows, at 30-min steps, for the chosen length.
  const slotOptions = useMemo<AvailabilitySlot[]>(() => {
    if (!detail) return [];
    const out: AvailabilitySlot[] = [];
    for (const w of detail.shared) {
      for (let c = w.start; c + durMs <= w.end; c += SLOT_STEP_MS) out.push({ start: c, end: c + durMs });
    }
    return out;
  }, [detail, durMs]);

  const activeStart =
    selectedStart != null && slotOptions.some((s) => s.start === selectedStart) ? selectedStart : slotOptions[0]?.start ?? null;
  const selectedStarts = useMemo(() => new Set(activeStart != null ? [activeStart] : []), [activeStart]);

  const everyoneStates = useMemo<DayState[]>(
    () => (grid ? grid.windowByDay.map((w) => (w && w.end - w.start >= durMs ? "free" : "busy")) : []),
    [grid, durMs]
  );

  const rows = useMemo<WeekRow[]>(() => {
    if (!grid) return [];
    return [...grid.friends.map((states, i) => ({ label: `Friend ${i + 1}`, states })), { label: "Everyone", states: everyoneStates, result: true }];
  }, [grid, everyoneStates]);

  const openCount = everyoneStates.filter((s) => s === "free").length;

  function pickDay(i: number) {
    setSelectedDay(i);
    setSelectedStart(null);
  }
  function pickSlot(slot: AvailabilitySlot) {
    setSelectedStart(slot.start);
  }

  function book() {
    if (!ids || activeStart == null) return;
    const start = activeStart;
    const end = start + durMs;
    startTransition(async () => {
      try {
        const created = await batchBookSlots(ids.map((id) => ({ resourceId: id, start, end, label: "Dinner" })));
        setResult({
          title: "Dinner booked",
          subtitle: `${dayLabel(start)} · ${formatTime(start)} to ${formatTime(end)}`,
          bookings: created,
          resources: ids.map((id, i) => asResource(id, `Friend ${i + 1}`)),
        });
        await load(ids);
      } catch (err) {
        toast.error(formatError(err instanceof Error ? err.message : String(err)));
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

  if (!grid) {
    return <div className="flex h-full items-center justify-center bg-[#0a0a0c] text-sm text-zinc-500">Could not reach Δt.</div>;
  }

  const tray =
    activeStart != null ? (
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 text-sm text-zinc-300">
          {dayLabel(activeStart)} · {formatTime(activeStart)} to {formatTime(activeStart + durMs)} · books all five at once
        </div>
        <BookButton onClick={book} loading={isPending}>
          Book dinner
        </BookButton>
      </div>
    ) : undefined;

  return (
    <>
      <Stage primitive={{ label: "A time several calendars all share", specId: "AVAIL-08" }} title="Find a time the group shares" tray={tray}>
        <div className="mx-auto max-w-2xl">
          <div className="text-center">
            <h3 className="text-sm font-semibold text-zinc-100">Dinner with five friends</h3>
            <p className="mx-auto mt-1 max-w-lg text-[12px] leading-relaxed text-zinc-400">
              The bottom row is when all five are free at once. Pick a length, a green{" "}
              <span className="text-emerald-300">Everyone</span> evening, then a time.
            </p>
          </div>

          <div className="mb-3 mt-5 flex items-center justify-center gap-2">
            <span className="text-[11px] text-zinc-500">Dinner length</span>
            <Segmented
              items={DURATIONS.map((m) => ({ value: m, label: durationLabel(m) }))}
              value={duration}
              onChange={(m) => {
                setDuration(m);
                setSelectedStart(null);
              }}
              ariaLabel="Dinner length"
            />
          </div>

          <WeekTimeline start={grid.start} dayCount={HORIZON_DAYS} rows={rows} onPick={pickDay} selectedDay={selectedDay ?? undefined} labelWidth={52} />
          <div className="mt-2 text-center text-[11px] text-zinc-500">
            {openCount > 0
              ? `${openCount} evening${openCount > 1 ? "s" : ""} fit a ${durationLabel(duration)} dinner for all five`
              : `No evening fits a ${durationLabel(duration)} dinner for all five in the next three weeks`}
          </div>

          {/* Reserved so picking a day swaps content in place instead of growing the panel. */}
          <div className="mt-5 min-h-[23rem] rounded-lg border border-white/[0.07] bg-white/[0.02] p-4">
            {detail ? (
              <>
                <div className="mb-3 text-center">
                  <div className="text-sm font-medium text-zinc-100">{dayLabel(detail.dayStart)}</div>
                  <div className="text-[12px] text-zinc-400">
                    {slotOptions.length > 0 ? "Pick a start time on the All free lane" : `No ${durationLabel(duration)} window all five share this evening`}
                  </div>
                </div>
                <MeetLanes
                  axisStart={detail.dayStart + AXIS_START_HOUR * H}
                  axisEnd={detail.dayStart + AXIS_END_HOUR * H}
                  intersectionSlots={slotOptions}
                  selectedStarts={selectedStarts}
                  onPickSlot={pickSlot}
                  lanes={[...detail.friendLanes, { label: "All free", slots: detail.shared, intersection: true }]}
                />
              </>
            ) : (
              <div className="flex min-h-[21rem] items-center justify-center text-center text-sm text-zinc-500">
                Pick a day to see common times
              </div>
            )}
          </div>
        </div>
      </Stage>

      <BookingConfirmedModal result={result} onClose={() => setResult(null)} onBookAnother={() => setResult(null)} />

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
