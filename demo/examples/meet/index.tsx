"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Stage } from "@/components/stage";
import { MeetLanes } from "./meet-lanes";
import { NextAvailability } from "@/components/next-availability";
import { BookingConfirmedModal, type BookingResult } from "@/components/booking-confirmed-modal";
import type { AvailabilitySlot, Resource } from "@/lib/schemas";
import { toLocalDateString, formatTime } from "@/lib/time";

import { ensureMeetCalendars } from "./seed";
import { getAvailability, getCombinedAvailability } from "@/app/actions/availability";
import { batchBookSlots } from "@/app/actions/bookings";
import { useWebSocket } from "@/hooks/use-websocket";
import { formatError } from "@/lib/format-error";

const SLOT_STEP_MS = 30 * 60_000;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const AXIS_START_HOUR = 8;
const AXIS_END_HOUR = 18;
const DURATIONS = [30, 60] as const;
type Duration = (typeof DURATIONS)[number];

interface MeetIds {
  janeId: string;
  bobId: string;
}

function asResource(id: string, name: string): Resource {
  return { id, parentId: null, name, capacity: 1, bufferAfter: null, slotMinutes: 30, price: null, bufferMinutes: 0 };
}

export default function MeetExample() {
  const [ids, setIds] = useState<MeetIds | null>(null);
  const [date, setDate] = useState(toLocalDateString(new Date()));
  const [janeFree, setJaneFree] = useState<AvailabilitySlot[]>([]);
  const [bobFree, setBobFree] = useState<AvailabilitySlot[]>([]);
  const [bothFree, setBothFree] = useState<AvailabilitySlot[]>([]);
  const [duration, setDuration] = useState<Duration>(30);
  const [selectedStarts, setSelectedStarts] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<BookingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const dayStart = new Date(`${date}T00:00`).getTime();
  const axisStart = dayStart + AXIS_START_HOUR * HOUR_MS;
  const axisEnd = dayStart + AXIS_END_HOUR * HOUR_MS;
  const durationMs = duration * 60_000;

  // Discrete bookable start times across the both-free windows, at 30-min steps.
  const slotOptions = useMemo<AvailabilitySlot[]>(() => {
    const out: AvailabilitySlot[] = [];
    for (const w of bothFree) {
      for (let c = w.start; c + durationMs <= w.end; c += SLOT_STEP_MS) {
        out.push({ start: c, end: c + durationMs });
      }
    }
    return out;
  }, [bothFree, durationMs]);

  const selectedSlots = useMemo(
    () => slotOptions.filter((s) => selectedStarts.has(s.start)),
    [slotOptions, selectedStarts]
  );

  const refresh = useCallback(async (calendars: MeetIds, day: string) => {
    const ds = new Date(`${day}T00:00`).getTime();
    const de = ds + DAY_MS;
    const [jane, bob, both] = await Promise.all([
      getAvailability(calendars.janeId, ds, de),
      getAvailability(calendars.bobId, ds, de),
      // min_available = 2 → the intersection: both Jane and Bob free.
      getCombinedAvailability([calendars.janeId, calendars.bobId], ds, de, 2),
    ]);
    setJaneFree(jane);
    setBobFree(bob);
    setBothFree(both);
    setSelectedStarts(new Set());
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const got = await ensureMeetCalendars();
        setIds(got);
        await refresh(got, date);
      } catch {
        toast.error("Failed to connect to deltat. Is it running?");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeDate(d: string) {
    setDate(d);
    setSelectedStarts(new Set());
    if (ids) startTransition(() => void refresh(ids, d));
  }

  function shiftDay(delta: number) {
    const d = new Date(`${date}T00:00`);
    d.setDate(d.getDate() + delta);
    changeDate(toLocalDateString(d));
  }

  // Default to the first joint-free slot so the page never looks empty.
  useEffect(() => {
    if (selectedStarts.size > 0 || slotOptions.length === 0) return;
    setSelectedStarts(new Set([slotOptions[0].start]));
  }, [slotOptions, selectedStarts]);

  // Live: re-read both calendars on any booking/cancel from either side.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onWsEvent = useCallback(() => {
    if (!ids) return;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => void refresh(ids, date), 200);
  }, [ids, date, refresh]);
  useEffect(() => () => clearTimeout(refreshTimer.current), []);
  useWebSocket(ids ? { type: "subscribe", resourceId: ids.janeId, onEvent: onWsEvent } : null);
  useWebSocket(ids ? { type: "subscribe", resourceId: ids.bobId, onEvent: onWsEvent } : null);

  function pickDuration(d: Duration) {
    setDuration(d);
    setSelectedStarts(new Set()); // slot grid changes — restart selection (default picks the first)
  }

  // Click a slot → select just it; shift/cmd-click → toggle it in the multi-selection.
  function pick(slot: AvailabilitySlot, additive: boolean) {
    setSelectedStarts((prev) => {
      if (!additive) return new Set([slot.start]);
      const next = new Set(prev);
      if (next.has(slot.start)) next.delete(slot.start);
      else next.add(slot.start);
      return next;
    });
  }

  function book() {
    if (!ids || selectedSlots.length === 0) return;
    const cal = ids;
    const day = date;
    const slots = selectedSlots;
    startTransition(async () => {
      try {
        const rows = slots.flatMap((s) => [
          { resourceId: cal.janeId, start: s.start, end: s.end, label: "Meeting" },
          { resourceId: cal.bobId, start: s.start, end: s.end, label: "Meeting" },
        ]);
        const created = await batchBookSlots(rows);
        setResult({
          title: `${slots.length} meeting${slots.length > 1 ? "s" : ""} · Jane + Bob`,
          subtitle: slots.map((s) => formatTime(s.start)).join(" · "),
          bookings: created,
          resources: [asResource(cal.janeId, "Jane"), asResource(cal.bobId, "Bob")],
        });
        await refresh(cal, day);
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
          Connecting to deltat…
        </div>
      </div>
    );
  }

  const ribbon = (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-zinc-300"
          disabled={isPending}
          onClick={() => shiftDay(-1)}
          aria-label="Previous day"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <input
          type="date"
          value={date}
          disabled={isPending}
          onChange={(e) => changeDate(e.target.value)}
          className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-200 disabled:opacity-50 [color-scheme:dark]"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-zinc-300"
          disabled={isPending}
          onClick={() => shiftDay(1)}
          aria-label="Next day"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-1 rounded-full border border-white/10 p-0.5">
        {DURATIONS.map((d) => {
          const active = duration === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => pickDuration(d)}
              className={cn(
                "rounded-full px-3 py-1 text-xs transition-colors",
                active ? "bg-emerald-400/15 text-emerald-200" : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              {d} min
            </button>
          );
        })}
      </div>
      <span className="text-[11px] text-zinc-500">
        {bothFree.length === 0 ? "no shared free time" : `${bothFree.length} shared window${bothFree.length > 1 ? "s" : ""}`}
      </span>
    </div>
  );

  const n = selectedSlots.length;
  const noShared = bothFree.length === 0;
  const tray = noShared ? undefined : n > 0 ? (
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <div className="text-sm font-medium text-zinc-100">
            {n === 1 ? `Meeting · ${formatTime(selectedSlots[0].start)} to ${formatTime(selectedSlots[0].end)}` : `${n} meetings selected`}
          </div>
          <div className="text-xs text-zinc-400">{duration} min · books atomically on both calendars</div>
        </div>
        <Button onClick={book} disabled={isPending} className="h-10 px-6 text-sm font-semibold bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-400">
          {n > 1 ? `Book ${n} meetings` : "Book both"}
        </Button>
      </div>
    ) : (
      <div className="text-center text-xs text-zinc-400">
        Click the <span className="text-emerald-300">Both free</span> lane to pick a meeting time.
      </div>
    );

  return (
    <>
      <Stage
        primitive={{ label: "Multi-resource intersection · atomic batch", specId: "AVAIL-08" }}
        title="Find a meeting time"
        ribbon={ribbon}
        tray={tray}
      >
        <div className="relative">
          <MeetLanes
            axisStart={axisStart}
            axisEnd={axisEnd}
            intersectionSlots={slotOptions}
            selectedStarts={selectedStarts}
            onPickSlot={pick}
            lanes={[
              { label: "Jane", slots: janeFree },
              { label: "Bob", slots: bobFree },
              { label: "Both free", slots: bothFree, intersection: true },
            ]}
          />
          {noShared && ids && (
            <NextAvailability
              resourceIds={[ids.janeId, ids.bobId]}
              from={new Date(`${date}T00:00`)}
              title="Bob and Jane have no shared free time today."
              minAvailable={2}
              minDurationMs={durationMs}
              horizonDays={28}
              onJump={(o) => changeDate(o.date)}
            />
          )}
        </div>

        <p className="mt-5 text-center text-[11px] text-zinc-500">
          Jane and Bob keep independent timelines. The bottom lane is{" "}
          <span className="text-emerald-300">min_available = 2</span> across both, the intersection
          computed by deltat, lined up under the overlap above.
        </p>
      </Stage>

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
    </>
  );
}
