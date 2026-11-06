"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@open-deltat/shared/utils";
import { formatTime } from "@open-deltat/shared/time";
import { Stage } from "../../components/stage";
import { Segmented } from "../../components/ui/segmented";
import { BookButton } from "../../components/book-button";
import { MeetLanes } from "./meet-lanes";
import { BookingConfirmedModal, type BookingResult } from "../../components/booking-confirmed-modal";
import type { AvailabilitySlot, Resource } from "../../lib/schemas";

import { ensureMeetFriends } from "./seed";
import { getAvailability, getCombinedAvailability } from "../../actions/availability";
import { batchBookSlots } from "../../actions/bookings";
import { useWebSocket } from "../../hooks/use-websocket";
import { formatError } from "../../lib/format-error";

const H = 3_600_000;
const DAY = 86_400_000;
const HORIZON_DAYS = 14;
const SLOT_STEP_MS = 30 * 60_000;
const AXIS_START_HOUR = 17;
const AXIS_END_HOUR = 23;
const DURATIONS = [30, 60, 120, 150] as const;
type Duration = (typeof DURATIONS)[number];
const durationLabel = (m: number) => (m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} hr` : `${(m / 60).toFixed(1)} hr`);

interface Data {
  start: number;
  perFriend: AvailabilitySlot[][]; // each friend's free windows across the horizon
  shared: AvailabilitySlot[]; // every window all five are free at once
}

interface Evening {
  dayStart: number;
  fits: AvailabilitySlot[]; // the shared windows that night long enough for the chosen length
}

function asResource(id: string, name: string): Resource {
  return { id, parentId: null, name, capacity: 1, bufferAfter: null, slotMinutes: 30, price: null, bufferMinutes: 0 };
}

const friendName = (i: number) => `Friend ${i + 1}`;
const dayLabel = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
const weekday = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "short" });
const dateNum = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const dayOf = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const inDay = (dayStart: number) => (s: AvailabilitySlot) => s.start < dayStart + DAY && s.end > dayStart;

export default function MeetExample() {
  const [ids, setIds] = useState<string[] | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [duration, setDuration] = useState<Duration>(60);
  const [pickedDay, setPickedDay] = useState<number | null>(null);
  const [pickedStart, setPickedStart] = useState<number | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const durMs = duration * 60_000;

  const load = useCallback(async (friendIds: string[]) => {
    const start = dayOf(Date.now());
    const end = start + HORIZON_DAYS * DAY;
    const [perFriend, shared] = await Promise.all([
      Promise.all(friendIds.map((id) => getAvailability(id, start, end))),
      // min_available = all friends: the intersection, every window when all five are free at once.
      getCombinedAvailability(friendIds, start, end, friendIds.length),
    ]);
    setData({ start, perFriend, shared });
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

  // Live: re-read on any booking or cancel in any of the five calendars.
  const reload = useCallback(() => {
    if (ids && !isPending) void load(ids);
  }, [ids, isPending, load]);
  useWebSocket(ids?.[0] ? { type: "subscribe", resourceId: ids[0], onEvent: reload } : null);
  useWebSocket(ids?.[1] ? { type: "subscribe", resourceId: ids[1], onEvent: reload } : null);
  useWebSocket(ids?.[2] ? { type: "subscribe", resourceId: ids[2], onEvent: reload } : null);
  useWebSocket(ids?.[3] ? { type: "subscribe", resourceId: ids[3], onEvent: reload } : null);
  useWebSocket(ids?.[4] ? { type: "subscribe", resourceId: ids[4], onEvent: reload } : null);

  // Only the evenings where the chosen length fits for everyone: the answer, not the raw calendars.
  const evenings = useMemo<Evening[]>(() => {
    if (!data) return [];
    return Array.from({ length: HORIZON_DAYS }, (_, i) => {
      const dayStart = data.start + i * DAY;
      const dayEnd = dayStart + DAY;
      const fits = data.shared
        .filter(inDay(dayStart))
        .map((s) => ({ start: Math.max(s.start, dayStart), end: Math.min(s.end, dayEnd) }))
        .filter((s) => s.end - s.start >= durMs);
      return { dayStart, fits };
    }).filter((e) => e.fits.length > 0);
  }, [data, durMs]);

  const evening = evenings.find((e) => e.dayStart === pickedDay) ?? evenings[0];

  const starts = useMemo<AvailabilitySlot[]>(
    () =>
      evening
        ? evening.fits.flatMap((w) =>
            Array.from({ length: Math.floor((w.end - w.start - durMs) / SLOT_STEP_MS) + 1 }, (_, k) => {
              const start = w.start + k * SLOT_STEP_MS;
              return { start, end: start + durMs };
            })
          )
        : [],
    [evening, durMs]
  );
  const chosen = starts.find((s) => s.start === pickedStart) ?? starts[0];

  const lanes = useMemo(() => {
    if (!data || !evening) return [];
    const ofDay = (slots: AvailabilitySlot[]) => slots.filter(inDay(evening.dayStart));
    return [
      ...data.perFriend.map((slots, i) => ({ label: friendName(i), slots: ofDay(slots) })),
      { label: "Everyone", slots: ofDay(data.shared), everyone: true },
    ];
  }, [data, evening]);

  function book() {
    if (!ids || !chosen) return;
    const { start, end } = chosen;
    startTransition(async () => {
      try {
        const created = await batchBookSlots(ids.map((id) => ({ resourceId: id, start, end, label: "Catch-up" })));
        setResult({
          title: "Booked for all five",
          subtitle: `${dayLabel(start)} · ${formatTime(start)} to ${formatTime(end)}`,
          bookings: created,
          resources: ids.map((id, i) => asResource(id, friendName(i))),
        });
        await load(ids);
      } catch (err) {
        toast.error(formatError(err instanceof Error ? err.message : String(err)));
      }
    });
  }

  if (loading) {
    return (
      <div className="dt-canvas flex h-full items-center justify-center text-dt-ink-3">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Connecting to Δt…
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="dt-canvas flex h-full items-center justify-center text-sm text-dt-ink-3">Could not reach Δt.</div>;
  }

  const tray = chosen ? (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-sm font-medium tabular-nums text-dt-ink">
          <span className="hidden sm:inline">
            {weekday(chosen.start)} {dateNum(chosen.start)} ·{" "}
          </span>
          {formatTime(chosen.start)} to {formatTime(chosen.end)}
        </div>
        <div className="hidden text-[12px] text-dt-ink-3 sm:block">Written to all five calendars in one step</div>
      </div>
      <BookButton onClick={book} loading={isPending}>
        Book for all five
      </BookButton>
    </div>
  ) : undefined;

  return (
    <>
      <Stage primitive={{ label: "The free time several calendars share", specId: "AVAIL-08" }} title="When is everyone free?" tray={tray}>
        <div className="mx-auto max-w-xl">
          <div className="text-center">
            <h3 className="text-[15px] font-semibold tracking-tight text-dt-ink">Five friends, five calendars</h3>
            <p className="mx-auto mt-1 max-w-md text-pretty text-[13px] leading-relaxed text-dt-ink-2">
              Pick how long. Δt shows only the evenings that fit all five.
            </p>
          </div>

          <div className="mt-5">
            <Segmented
              items={DURATIONS.map((m) => ({ value: m, label: durationLabel(m) }))}
              value={duration}
              onChange={(m) => {
                setDuration(m);
                setPickedStart(null);
              }}
              ariaLabel="How long"
            />
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-baseline justify-between px-1 text-[12px] text-dt-ink-3">
              <span>Evenings that work</span>
              <span className="tabular-nums">
                {evenings.length} in the next {HORIZON_DAYS} days
              </span>
            </div>
            {evenings.length > 0 ? (
              <div role="group" aria-label="Evenings that work" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {evenings.map((e) => {
                  const active = e.dayStart === evening?.dayStart;
                  return (
                    <button
                      key={e.dayStart}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setPickedDay(e.dayStart);
                        setPickedStart(null);
                      }}
                      className={cn(
                        "flex min-h-[64px] flex-col items-center justify-center rounded-2xl border px-2 py-2 transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]",
                        active
                          ? "border-dt-ink bg-dt-ink text-dt-on-ink"
                          : "border-dt-line bg-dt-surface text-dt-ink hover:border-dt-line-strong"
                      )}
                    >
                      <span className={cn("text-[11px] font-medium uppercase tracking-wide", active ? "text-dt-on-ink/70" : "text-dt-ink-3")}>
                        {weekday(e.dayStart)}
                      </span>
                      <span className="text-[15px] font-semibold tabular-nums">{dateNum(e.dayStart)}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-dt-line px-4 py-6 text-center text-sm text-dt-ink-3">
                No evening fits {durationLabel(duration)} for all five in the next {HORIZON_DAYS} days. Try a shorter time.
              </div>
            )}
          </div>

          {evening && (
            <div className="mt-6 rounded-2xl border border-dt-line bg-dt-sunken p-4">
              <div className="mb-3 text-sm font-medium text-dt-ink">{dayLabel(evening.dayStart)}</div>
              <MeetLanes
                lanes={lanes}
                axisStart={evening.dayStart + AXIS_START_HOUR * H}
                axisEnd={evening.dayStart + AXIS_END_HOUR * H}
                selected={chosen}
              />
              <div className="mt-5 mb-2 text-[12px] text-dt-ink-3">Start at</div>
              <Segmented
                className="justify-start"
                items={starts.map((s) => ({ value: s.start, label: <span className="tabular-nums">{formatTime(s.start)}</span> }))}
                value={chosen?.start ?? null}
                onChange={setPickedStart}
                ariaLabel="Start time"
              />
            </div>
          )}
        </div>
      </Stage>

      <BookingConfirmedModal result={result} onClose={() => setResult(null)} onBookAnother={() => setResult(null)} />
    </>
  );
}
