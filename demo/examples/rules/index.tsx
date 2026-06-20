"use client";

import { useEffect, useState, useCallback, useMemo, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Stage } from "@/components/stage";
import { NextAvailability } from "@/components/next-availability";
import { BookingConfirmedModal, type BookingResult } from "@/components/booking-confirmed-modal";
import type { Resource, Booking } from "@/lib/schemas";
import { formatTime } from "@/lib/time";

import { ensureRulesExample } from "./seed";
import { ScheduleBoard, type ResourceLane, type Span } from "./schedule-board";
import { DinnerFinder } from "./dinner-finder";
import { getResources } from "@/app/actions/resources";
import { getRulesForResource } from "@/app/actions/rules";
import { getMultiResourceBookings, batchBookSlots } from "@/app/actions/bookings";
import { getAvailability, getCombinedAvailability } from "@/app/actions/availability";
import { useWebSocket } from "@/hooks/use-websocket";
import { formatError } from "@/lib/format-error";

const H = 3_600_000;
const SLOT_MS = 60 * 60_000;

const STUDIO = {
  combinedLabel: "All free",
  bookLabel: "Book the session",
  note: "Five independent resources, each with its own schedule. The session can only run when the room, the engineer, the console, and both musicians are all free at once (the bottom row).",
};

export default function RulesExample() {
  const [ids, setIds] = useState<{ studio: string[]; dinner: string[] } | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [lanes, setLanes] = useState<ResourceLane[]>([]);
  const [combined, setCombined] = useState<Span[]>([]);
  const [selected, setSelected] = useState<{ start: number; end: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BookingResult | null>(null);

  const [date, setDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const todayMidnight = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);
  const dayStart = date.getTime();
  const dayEnd = dayStart + 86_400_000;
  const axisStart = dayStart + 7 * H;
  const axisEnd = dayStart + 23 * H;

  // The single-day board flow drives the studio scenario; "dinner" renders its own multi-week finder.
  const activeIds = useMemo(() => ids?.studio ?? [], [ids]);
  const minAvailable = activeIds.length;

  const nameOf = useCallback((id: string) => resources.find((r) => r.id === id)?.name ?? "Resource", [resources]);

  const load = useCallback(
    async (resourceIds: string[], min: number) => {
      if (resourceIds.length === 0) return;
      const [bookMap, combinedSlots] = await Promise.all([
        getMultiResourceBookings(resourceIds),
        getCombinedAvailability(resourceIds, dayStart, dayEnd, min),
      ]);
      const out: ResourceLane[] = [];
      for (const id of resourceIds) {
        const [rules, net] = await Promise.all([getRulesForResource(id), getAvailability(id, dayStart, dayEnd)]);
        const open: Span[] = rules.filter((r) => !r.blocking).map((r) => ({ start: r.start, end: r.end }));
        const blocking: Span[] = rules.filter((r) => r.blocking).map((r) => ({ start: r.start, end: r.end, label: "Blocked" }));
        const bookings: Span[] = ((bookMap[id] ?? []) as Booking[])
          .filter((b) => b.start < dayEnd && b.end > dayStart)
          .map((b) => ({ start: b.start, end: b.end, label: b.label || "Booked" }));
        out.push({ name: nameOf(id), open, busy: [...blocking, ...bookings], free: net.map((s) => ({ start: s.start, end: s.end })) });
      }
      setLanes(out);
      setCombined(combinedSlots.map((s) => ({ start: s.start, end: s.end })));
      setSelected((prev) =>
        prev ?? (combinedSlots.length ? { start: combinedSlots[0].start, end: Math.min(combinedSlots[0].start + SLOT_MS, combinedSlots[0].end) } : null)
      );
    },
    [dayStart, dayEnd, nameOf]
  );

  useEffect(() => {
    (async () => {
      try {
        const got = await ensureRulesExample();
        setIds(got);
        setResources(await getResources());
      } catch {
        toast.error("Failed to connect to deltat. Is it running?");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!ids || resources.length === 0) return;
    setSelected(null);
    load(activeIds, minAvailable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, resources, dayStart]);

  // Live: subscribe to the studio resources and re-read on any change.
  const reload = useCallback(() => {
    if (ids && !isPending) load(activeIds, minAvailable);
  }, [ids, isPending, activeIds, minAvailable, load]);
  useWebSocket(activeIds[0] ? { type: "subscribe", resourceId: activeIds[0], onEvent: reload } : null);
  useWebSocket(activeIds[1] ? { type: "subscribe", resourceId: activeIds[1], onEvent: reload } : null);
  useWebSocket(activeIds[2] ? { type: "subscribe", resourceId: activeIds[2], onEvent: reload } : null);
  useWebSocket(activeIds[3] ? { type: "subscribe", resourceId: activeIds[3], onEvent: reload } : null);
  useWebSocket(activeIds[4] ? { type: "subscribe", resourceId: activeIds[4], onEvent: reload } : null);

  function onPick(s: Span) {
    setSelected({ start: s.start, end: Math.min(s.start + SLOT_MS, s.end) });
  }

  function book() {
    if (!selected || activeIds.length === 0) return;
    const sel = selected;
    const label = "Studio session";
    startTransition(async () => {
      try {
        const created = await batchBookSlots(activeIds.map((id) => ({ resourceId: id, start: sel.start, end: sel.end, label })));
        setResult({
          title: `${label} booked`,
          subtitle: `${formatTime(sel.start)} to ${formatTime(sel.end)}`,
          bookings: created,
          resources: resources.filter((r) => activeIds.includes(r.id)),
        });
        await load(activeIds, minAvailable);
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

  const noSlot = combined.length === 0;
  const notToday = dayStart !== todayMidnight;
  const dateLabel = date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <>
      <Stage primitive={{ label: "Rules + resources · live timelines", specId: "AVAIL-08" }} title="Stacked resources, one timeline each">
        <div className="space-y-10">
          <section>
            <div className="mb-3 text-center">
              <h3 className="text-sm font-semibold text-zinc-100">Studio session</h3>
              <p className="text-[11px] text-zinc-500">A recording that needs five resources free at once, today.</p>
            </div>
            {notToday && (
              <div className="mb-3 flex items-center justify-center gap-2 text-xs text-zinc-400">
                <span>Viewing {dateLabel}</span>
                <button type="button" onClick={() => setDate(new Date(todayMidnight))} className="text-emerald-300 hover:text-emerald-200">
                  back to today
                </button>
              </div>
            )}
            <div className="relative">
              <ScheduleBoard
                resources={lanes}
                combined={combined}
                combinedLabel={STUDIO.combinedLabel}
                selected={selected}
                onPick={onPick}
                axisStart={axisStart}
                axisEnd={axisEnd}
              />
              {noSlot && activeIds.length > 0 && (
                <NextAvailability
                  resourceIds={activeIds}
                  from={date}
                  title="The room, engineer, console, and musicians are not all free today."
                  minAvailable={minAvailable}
                  minDurationMs={SLOT_MS}
                  horizonDays={28}
                  onJump={(o) => {
                    const d = new Date(o.start);
                    d.setHours(0, 0, 0, 0);
                    setDate(d);
                  }}
                />
              )}
            </div>
            {!noSlot && selected && (
              <div className="mx-auto mt-4 flex max-w-2xl items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
                <div className="text-xs text-zinc-400">
                  {formatTime(selected.start)} to {formatTime(selected.end)} · books all {activeIds.length} at once
                </div>
                <Button onClick={book} disabled={isPending} className="h-10 px-6 text-sm font-semibold bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-400">
                  {STUDIO.bookLabel}
                </Button>
              </div>
            )}
            <p className="mx-auto mt-4 max-w-2xl text-center text-[11.5px] leading-relaxed text-zinc-500">{STUDIO.note}</p>
          </section>

          <div className="h-px bg-white/[0.06]" />

          <section>{ids && <DinnerFinder resourceIds={ids.dinner} resources={resources} />}</section>
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
