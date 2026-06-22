"use client";

import { useEffect, useState, useCallback, useMemo, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Stage } from "@/components/stage";
import { BookButton } from "@/components/book-button";
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

const dayLabel = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

export default function RulesExample() {
  const [ids, setIds] = useState<{ studio: string[]; dinner: string[] } | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [lanes, setLanes] = useState<ResourceLane[]>([]);
  const [combined, setCombined] = useState<Span[]>([]);
  const [selected, setSelected] = useState<{ start: number; end: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BookingResult | null>(null);

  // One Stage, one floating tray, two booking flows: the tray shows whichever scenario you last
  // touched (the studio board or the dinner finder), so the booker is always in the same place.
  const [lastFlow, setLastFlow] = useState<"studio" | "dinner">("studio");
  const [dinnerPending, setDinnerPending] = useState<{ start: number; end: number } | null>(null);
  const [dinnerReloadKey, setDinnerReloadKey] = useState(0);

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
        toast.error("Failed to connect to Δt. Is it running?");
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
    setLastFlow("studio");
    setSelected({ start: s.start, end: Math.min(s.start + SLOT_MS, s.end) });
  }

  // The dinner finder reports its bookable pick + when it's interacted with, so the shared tray can
  // show the dinner booker; index owns the actual booking + the success modal for both flows.
  const handleDinnerPending = useCallback((p: { start: number; end: number } | null) => setDinnerPending(p), []);
  const handleDinnerInteract = useCallback(() => setLastFlow("dinner"), []);

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

  function bookDinner() {
    if (!ids || !dinnerPending) return;
    const dinnerIds = ids.dinner;
    const { start, end } = dinnerPending;
    startTransition(async () => {
      try {
        const created = await batchBookSlots(dinnerIds.map((id) => ({ resourceId: id, start, end, label: "Dinner" })));
        setResult({
          title: "Dinner booked",
          subtitle: `${dayLabel(start)} · ${formatTime(start)} to ${formatTime(end)}`,
          bookings: created,
          resources: resources.filter((r) => dinnerIds.includes(r.id)),
        });
        setDinnerReloadKey((k) => k + 1);
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

  const noSlot = combined.length === 0;
  const notToday = dayStart !== todayMidnight;
  const dateLabel = date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const studioTray =
    !noSlot && selected ? (
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-zinc-300">
          {formatTime(selected.start)} to {formatTime(selected.end)} · books all {activeIds.length} at once
        </div>
        <BookButton onClick={book} loading={isPending}>
          Book the session
        </BookButton>
      </div>
    ) : undefined;

  const dinnerTray = dinnerPending ? (
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm text-zinc-300">
        {dayLabel(dinnerPending.start)} · {formatTime(dinnerPending.start)} to {formatTime(dinnerPending.end)}
      </div>
      <BookButton onClick={bookDinner} loading={isPending}>
        Book dinner
      </BookButton>
    </div>
  ) : undefined;

  const tray = lastFlow === "dinner" ? dinnerTray ?? studioTray : studioTray ?? dinnerTray;

  return (
    <>
      <Stage primitive={{ label: "Line up several calendars at once", specId: "AVAIL-08" }} title="Find a time everyone shares" tray={tray}>
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
                combinedLabel="All free"
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
          </section>

          <div className="h-px bg-white/[0.06]" />

          <section>
            {ids && (
              <DinnerFinder
                resourceIds={ids.dinner}
                onPendingChange={handleDinnerPending}
                onInteract={handleDinnerInteract}
                reloadKey={dinnerReloadKey}
              />
            )}
          </section>
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
