"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Stage } from "@/components/stage";
import { MeetLanes } from "./meet-lanes";
import { BookingConfirmedModal, type BookingResult } from "@/components/booking-confirmed-modal";
import type { AvailabilitySlot, Resource } from "@/lib/schemas";
import { toLocalDateString, formatTime } from "@/lib/time";

import { ensureMeetCalendars } from "./seed";
import { getAvailability, getCombinedAvailability } from "@/app/actions/availability";
import { batchBookSlots } from "@/app/actions/bookings";
import { formatError } from "@/lib/format-error";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const AXIS_START_HOUR = 8;
const AXIS_END_HOUR = 18;
const DURATIONS = [30, 60] as const;
type Duration = (typeof DURATIONS)[number];

interface MeetIds {
  aliceId: string;
  bobId: string;
}

function asResource(id: string, name: string): Resource {
  return { id, parentId: null, name, capacity: 1, bufferAfter: null, slotMinutes: 30, price: null, bufferMinutes: 0 };
}

/** Leading window of `durationMs` inside a free block, or null if it doesn't fit. */
function snapToWindow(slot: AvailabilitySlot, durationMs: number): { start: number; end: number } | null {
  if (slot.end - slot.start < durationMs) return null;
  return { start: slot.start, end: slot.start + durationMs };
}

export default function MeetExample() {
  const [ids, setIds] = useState<MeetIds | null>(null);
  const [date, setDate] = useState(toLocalDateString(new Date()));
  const [aliceFree, setAliceFree] = useState<AvailabilitySlot[]>([]);
  const [bobFree, setBobFree] = useState<AvailabilitySlot[]>([]);
  const [bothFree, setBothFree] = useState<AvailabilitySlot[]>([]);
  const [duration, setDuration] = useState<Duration>(30);
  const [selected, setSelected] = useState<{ start: number; end: number } | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const dayStart = new Date(`${date}T00:00`).getTime();
  const axisStart = dayStart + AXIS_START_HOUR * HOUR_MS;
  const axisEnd = dayStart + AXIS_END_HOUR * HOUR_MS;
  const durationMs = duration * 60_000;

  const refresh = useCallback(async (calendars: MeetIds, day: string) => {
    const ds = new Date(`${day}T00:00`).getTime();
    const de = ds + DAY_MS;
    const [alice, bob, both] = await Promise.all([
      getAvailability(calendars.aliceId, ds, de),
      getAvailability(calendars.bobId, ds, de),
      // min_available = 2 → the intersection: both Alice and Bob free.
      getCombinedAvailability([calendars.aliceId, calendars.bobId], ds, de, 2),
    ]);
    setAliceFree(alice);
    setBobFree(bob);
    setBothFree(both);
    setSelected(null);
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
    setSelected(null);
    if (ids) startTransition(() => void refresh(ids, d));
  }

  function shiftDay(delta: number) {
    const d = new Date(`${date}T00:00`);
    d.setDate(d.getDate() + delta);
    changeDate(toLocalDateString(d));
  }

  // Default to the first joint-free window of the day so the page never looks empty.
  useEffect(() => {
    if (selected || bothFree.length === 0) return;
    const first = bothFree.map((s) => snapToWindow(s, durationMs)).find(Boolean);
    if (first) setSelected(first);
  }, [bothFree, durationMs, selected]);

  function pickDuration(d: Duration) {
    setDuration(d);
    // Re-snap any current selection to the new duration if it still fits.
    if (selected) {
      const block = bothFree.find((s) => s.start <= selected.start && s.end >= selected.start);
      setSelected(block ? snapToWindow(block, d * 60_000) : null);
    }
  }

  function pick(slot: AvailabilitySlot) {
    setSelected(snapToWindow(slot, durationMs));
  }

  function book() {
    if (!ids || !selected) return;
    const cal = ids;
    const sel = selected;
    const day = date;
    startTransition(async () => {
      try {
        const created = await batchBookSlots([
          { resourceId: cal.aliceId, start: sel.start, end: sel.end, label: "Meeting" },
          { resourceId: cal.bobId, start: sel.start, end: sel.end, label: "Meeting" },
        ]);
        setResult({
          title: "Meeting booked · Alice + Bob",
          subtitle: `${formatTime(sel.start)} – ${formatTime(sel.end)}`,
          bookings: created,
          resources: [asResource(cal.aliceId, "Alice"), asResource(cal.bobId, "Bob")],
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
                active
                  ? "bg-emerald-400/15 text-emerald-200"
                  : "text-zinc-400 hover:text-zinc-200"
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

  const tray = selected ? (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex-1">
        <div className="text-sm font-medium text-zinc-100">
          Meeting · {formatTime(selected.start)} – {formatTime(selected.end)}
        </div>
        <div className="text-xs text-zinc-400">
          {duration} min · books atomically on both calendars
        </div>
      </div>
      <Button
        onClick={book}
        disabled={isPending}
        className="bg-emerald-500 text-white hover:bg-emerald-400"
      >
        Book both
      </Button>
    </div>
  ) : (
    <div className="text-center text-xs text-zinc-400">
      Click a green window in the <span className="text-emerald-300">Both free</span> lane to pick a meeting time.
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
        <MeetLanes
          axisStart={axisStart}
          axisEnd={axisEnd}
          minDurationMs={durationMs}
          selected={selected}
          onPickIntersection={pick}
          lanes={[
            { label: "Alice", slots: aliceFree },
            { label: "Bob", slots: bobFree },
            { label: "Both free", slots: bothFree, intersection: true },
          ]}
        />
        <p className="mt-5 text-center text-[11px] text-zinc-500">
          Alice and Bob keep independent timelines. The bottom lane is{" "}
          <span className="text-emerald-300">min_available = 2</span> across both — the intersection,
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
