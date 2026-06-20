"use client";

import { useEffect, useState, useCallback, useMemo, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Stage } from "@/components/stage";
import { NextAvailability } from "@/components/next-availability";
import { BookingConfirmedModal, type BookingResult } from "@/components/booking-confirmed-modal";
import type { Resource, Booking } from "@/lib/schemas";
import { formatTime } from "@/lib/time";

import { ensureRulesExample } from "./seed";
import { ScheduleBoard, type ResourceLane, type Span } from "./schedule-board";
import { getResources } from "@/app/actions/resources";
import { getRulesForResource } from "@/app/actions/rules";
import { getMultiResourceBookings, batchBookSlots } from "@/app/actions/bookings";
import { getAvailability, getCombinedAvailability } from "@/app/actions/availability";
import { useWebSocket } from "@/hooks/use-websocket";
import { formatError } from "@/lib/format-error";

const H = 3_600_000;
const SLOT_MS = 60 * 60_000;

type Scenario = "worklife" | "studio";

const SCENARIOS: Record<
  Scenario,
  { tab: string; title: string; combinedLabel: string; bookLabel: string; note: string; min: number | "all" }
> = {
  worklife: {
    tab: "Work + personal",
    title: "One person, two calendars",
    combinedLabel: "Free (either)",
    bookLabel: "Hold this slot",
    note: "Two resources for one person. Each calendar keeps its own availability and its own bookings. The bottom row is when Bob is free in either.",
    min: 1,
  },
  studio: {
    tab: "Studio session",
    title: "A session that needs three resources",
    combinedLabel: "All free",
    bookLabel: "Book the session",
    note: "Three independent resources, each with its own schedule. A session can only run when the room, the engineer, and the console are all free at once (the bottom row).",
    min: "all",
  },
};

export default function RulesExample() {
  const [ids, setIds] = useState<{ worklife: string[]; studio: string[] } | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [scenario, setScenario] = useState<Scenario>("worklife");
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

  const activeIds = useMemo(
    () => (ids ? (scenario === "worklife" ? ids.worklife : ids.studio) : []),
    [ids, scenario]
  );
  const minAvailable = SCENARIOS[scenario].min === "all" ? activeIds.length : (SCENARIOS[scenario].min as number);

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
  }, [ids, resources, scenario, dayStart]);

  // Live: subscribe to the active resources (max 3) and re-read on any change.
  const reload = useCallback(() => {
    if (ids && !isPending) load(activeIds, minAvailable);
  }, [ids, isPending, activeIds, minAvailable, load]);
  useWebSocket(activeIds[0] ? { type: "subscribe", resourceId: activeIds[0], onEvent: reload } : null);
  useWebSocket(activeIds[1] ? { type: "subscribe", resourceId: activeIds[1], onEvent: reload } : null);
  useWebSocket(activeIds[2] ? { type: "subscribe", resourceId: activeIds[2], onEvent: reload } : null);

  function onPick(s: Span) {
    setSelected({ start: s.start, end: Math.min(s.start + SLOT_MS, s.end) });
  }

  function book() {
    if (!selected || activeIds.length === 0) return;
    const sel = selected;
    const label = scenario === "worklife" ? "Bob" : "Studio session";
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

  const sc = SCENARIOS[scenario];
  const ribbon = (
    <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1 text-[12px]">
      {(Object.keys(SCENARIOS) as Scenario[]).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => setScenario(k)}
          className={cn(
            "rounded-md px-3 py-1.5 font-medium transition-colors",
            scenario === k ? "bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-400/30" : "text-zinc-400 hover:text-zinc-200"
          )}
        >
          {SCENARIOS[k].tab}
        </button>
      ))}
    </div>
  );

  const noSlot = combined.length === 0;
  const notToday = dayStart !== todayMidnight;
  const dateLabel = date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const tray = noSlot ? undefined : selected ? (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex-1">
        <div className="text-sm font-medium text-zinc-100">{sc.title}</div>
        <div className="text-xs text-zinc-400">
          {formatTime(selected.start)} to {formatTime(selected.end)} · books all {activeIds.length} at once
        </div>
      </div>
      <Button
        onClick={book}
        disabled={isPending}
        className="h-10 px-6 text-sm font-semibold bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-400"
      >
        {sc.bookLabel}
      </Button>
    </div>
  ) : (
    <div className="text-center text-xs text-zinc-400">Pick a green slot in the bottom row.</div>
  );

  return (
    <>
      <Stage primitive={{ label: "Rules + resources · live timelines", specId: "AVAIL-08" }} title={sc.title} ribbon={ribbon} tray={tray}>
        {notToday && (
          <div className="mb-3 flex items-center justify-center gap-2 text-xs text-zinc-400">
            <span>Viewing {dateLabel}</span>
            <button
              type="button"
              onClick={() => setDate(new Date(todayMidnight))}
              className="text-emerald-300 hover:text-emerald-200"
            >
              back to today
            </button>
          </div>
        )}
        <div className="relative">
          <ScheduleBoard
            resources={lanes}
            combined={combined}
            combinedLabel={sc.combinedLabel}
            selected={selected}
            onPick={onPick}
            axisStart={axisStart}
            axisEnd={axisEnd}
          />
          {noSlot && activeIds.length > 0 && (
            <NextAvailability
              resourceIds={activeIds}
              from={date}
              title={
                scenario === "studio"
                  ? "The room, engineer, and console are not all free today."
                  : "Bob has no free time today."
              }
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
        <p className="mx-auto mt-5 max-w-2xl text-center text-[11.5px] leading-relaxed text-zinc-500">{sc.note}</p>
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
