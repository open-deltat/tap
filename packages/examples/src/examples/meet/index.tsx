"use client";

import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@open-deltat/shared/utils";
import { formatTime } from "@open-deltat/shared/time";
import { Stage } from "../../components/stage";
import { Segmented } from "../../components/ui/segmented";
import { BookButton } from "../../components/book-button";
import { MeetLanes } from "./meet-lanes";
import { FRIEND_NAMES } from "../../lib/friends";
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
  starts: number[]; // every bookable start that night for the chosen length, at 30-minute steps
}

function asResource(id: string, name: string): Resource {
  return { id, parentId: null, name, capacity: 1, bufferAfter: null, slotMinutes: 30, price: null, bufferMinutes: 0 };
}

const friendName = (i: number) => FRIEND_NAMES[i] ?? `Friend ${i + 1}`;
const dayLabel = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
const shortDay = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
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

  // Only the evenings where the chosen length fits for everyone, each with its bookable starts: the
  // answer, not the raw calendars.
  const evenings = useMemo<Evening[]>(() => {
    if (!data) return [];
    return Array.from({ length: HORIZON_DAYS }, (_, i) => {
      const dayStart = data.start + i * DAY;
      const starts = data.shared
        .filter(inDay(dayStart))
        .map((s) => ({ start: Math.max(s.start, dayStart), end: Math.min(s.end, dayStart + DAY) }))
        .flatMap((w) =>
          Array.from({ length: Math.max(0, Math.floor((w.end - w.start - durMs) / SLOT_STEP_MS) + 1) }, (_, k) => w.start + k * SLOT_STEP_MS)
        );
      return { dayStart, starts };
    }).filter((e) => e.starts.length > 0);
  }, [data, durMs]);

  const chosenStart =
    pickedStart != null && evenings.some((e) => e.starts.includes(pickedStart)) ? pickedStart : evenings[0]?.starts[0];
  const chosen = chosenStart != null ? { start: chosenStart, end: chosenStart + durMs } : undefined;
  const eveningIndex = chosen ? evenings.findIndex((e) => e.dayStart === dayOf(chosen.start)) : -1;
  const evening = eveningIndex >= 0 ? evenings[eveningIndex] : undefined;

  const lanes = useMemo(() => {
    if (!data || !evening) return [];
    const ofDay = (slots: AvailabilitySlot[]) => slots.filter(inDay(evening.dayStart));
    return [
      ...data.perFriend.map((slots, i) => ({ label: friendName(i), slots: ofDay(slots) })),
      { label: "Everyone", slots: ofDay(data.shared), everyone: true },
    ];
  }, [data, evening]);

  // The pager steps between evenings; landing on one picks its first start.
  function stepEvening(delta: -1 | 1) {
    const next = evenings[eveningIndex + delta];
    if (next) setPickedStart(next.starts[0]);
  }

  function pickDuration(m: Duration) {
    setDuration(m);
    setPickedStart(null);
  }

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
          <span className="hidden sm:inline">{shortDay(chosen.start)} · </span>
          {formatTime(chosen.start)} to {formatTime(chosen.end)}
        </div>
        <div className="hidden text-[12px] text-dt-ink-3 sm:block">Goes into all five calendars at once</div>
      </div>
      <BookButton onClick={book} loading={isPending}>
        Book for all five
      </BookButton>
    </div>
  ) : undefined;

  return (
    <>
      <Stage primitive={{ label: "The free time several calendars share", specId: "AVAIL-08" }} title="When is everyone free?" tray={tray}>
        {/* Like the appointments example: the choice on the left, the day on the right, one hairline between. */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[10rem_1fr] sm:gap-6">
          <div className="sm:border-r sm:border-dt-line sm:pr-6">
            <div className="text-[12px] text-dt-ink-3">How long</div>
            <div className="mt-2 sm:hidden">
              <Segmented
                className="justify-start"
                items={DURATIONS.map((m) => ({ value: m, label: durationLabel(m) }))}
                value={duration}
                onChange={pickDuration}
                ariaLabel="How long"
              />
            </div>
            <div role="radiogroup" aria-label="How long" className="mt-1 hidden divide-y divide-dt-line sm:block">
              {DURATIONS.map((m) => {
                const active = m === duration;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => pickDuration(m)}
                    className={cn(
                      "flex h-11 w-full items-center gap-2.5 text-left text-[14px] tabular-nums transition-colors",
                      active ? "font-semibold text-dt-ink" : "text-dt-ink-2 hover:text-dt-ink"
                    )}
                  >
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full border transition-colors", active ? "border-dt-ink bg-dt-ink" : "border-dt-line-strong")} />
                    {durationLabel(m)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex min-h-[22rem] flex-col">
            {evening && chosen ? (
              <>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 truncate text-[15px] font-semibold tracking-tight text-dt-ink">{dayLabel(evening.dayStart)}</div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="mr-1 text-[12px] tabular-nums text-dt-ink-3">
                      {eveningIndex + 1} of {evenings.length}
                    </span>
                    <PagerButton label="Previous evening" disabled={eveningIndex === 0} onClick={() => stepEvening(-1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </PagerButton>
                    <PagerButton label="Next evening" disabled={eveningIndex === evenings.length - 1} onClick={() => stepEvening(1)}>
                      <ChevronRight className="h-4 w-4" />
                    </PagerButton>
                  </div>
                </div>

                <MeetLanes
                  lanes={lanes}
                  axisStart={evening.dayStart + AXIS_START_HOUR * H}
                  axisEnd={evening.dayStart + AXIS_END_HOUR * H}
                  selected={chosen}
                />

                <div className="mt-5 border-t border-dt-line pt-4">
                  <div className="mb-2 text-[12px] text-dt-ink-3">Start at</div>
                  <Segmented
                    className="justify-start"
                    items={evening.starts.map((s) => ({ value: s, label: <span className="tabular-nums">{formatTime(s)}</span> }))}
                    value={chosen.start}
                    onChange={setPickedStart}
                    ariaLabel="Start time"
                  />
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-center text-sm text-dt-ink-3">
                No evening fits {durationLabel(duration)} for all five in the next {HORIZON_DAYS} days. Try a shorter time.
              </div>
            )}
          </div>
        </div>
      </Stage>

      <BookingConfirmedModal result={result} onClose={() => setResult(null)} onBookAnother={() => setResult(null)} />
    </>
  );
}

function PagerButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-10 w-10 place-items-center rounded-full border border-dt-line text-dt-ink transition-colors hover:bg-dt-sunken disabled:opacity-30 disabled:hover:bg-transparent sm:h-9 sm:w-9"
    >
      {children}
    </button>
  );
}
