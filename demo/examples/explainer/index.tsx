"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LabeledTimeline, type TimelineBox, type TimelineRow, type BoxColor } from "@/components/labeled-timeline";
import { HoldsStatic } from "./holds/holds-static";
import { OverviewTopic } from "./overview";
import { DataModelTopic } from "./concepts";
import { RecurringTopic } from "./recurring";
import { FlowTopic } from "./flow";
import { StableTopic } from "./stable";
import {
  AXIS_START_HOUR,
  AXIS_END_HOUR,
  HOUR_MS,
  DAY_MS,
  clampSpans,
  type Span,
  type PersonData,
} from "./algebra";
import { toLocalDateString, formatTime } from "@/lib/time";
import type { AvailabilitySlot, Booking, Rule } from "@/lib/schemas";

import { ensureExplainerCalendars } from "./seed";
import { getAvailability, getCombinedAvailability } from "@/app/actions/availability";
import { getRulesForResource } from "@/app/actions/rules";
import { getMultiResourceBookings } from "@/app/actions/bookings";
import { useWebSocket } from "@/hooks/use-websocket";

interface Ids {
  bobId: string;
  janeId: string;
}

// Sidebar: the first-principles overview, then the feature explainers, all static teaching pages.
const NAV: { id: string; label: string }[] = [
  { id: "overview", label: "Why deltat" },
  { id: "model", label: "Data model" },
  { id: "recurring", label: "Repeating times" },
  { id: "algebra", label: "Availability" },
  { id: "holds", label: "Holds and races" },
  { id: "flow", label: "Flow of a booking" },
  { id: "stable", label: "Same room, several nights" },
];

const emptyPerson = (name: string): PersonData => ({
  name,
  open: [],
  blocking: [],
  bookings: [],
  net: [],
});

function splitRules(rules: Rule[], ds: number, de: number): { open: Span[]; blocking: Span[] } {
  const open = clampSpans(rules.filter((r) => !r.blocking), ds, de);
  const blocking = clampSpans(rules.filter((r) => r.blocking), ds, de);
  return { open, blocking };
}

export default function ExplainerExample() {
  const [topic, setTopic] = useState<string>("overview");
  const [ids, setIds] = useState<Ids | null>(null);
  const [date] = useState(toLocalDateString(new Date()));
  const [bob, setBob] = useState<PersonData>(emptyPerson("Bob"));
  const [jane, setJane] = useState<PersonData>(emptyPerson("Jane"));
  const [combined, setCombined] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(true);

  const dayStart = new Date(`${date}T00:00`).getTime();
  const axisStart = dayStart + AXIS_START_HOUR * HOUR_MS;
  const axisEnd = dayStart + AXIS_END_HOUR * HOUR_MS;

  const loadAll = useCallback(
    async (cal: Ids) => {
      const ds = dayStart;
      const de = ds + DAY_MS;

      const [bobRules, janeRules] = await Promise.all([
        getRulesForResource(cal.bobId),
        getRulesForResource(cal.janeId),
      ]);
      const bookMap = await getMultiResourceBookings([cal.bobId, cal.janeId]);
      const [bobNet, janeNet, both] = await Promise.all([
        getAvailability(cal.bobId, ds, de),
        getAvailability(cal.janeId, ds, de),
        getCombinedAvailability([cal.bobId, cal.janeId], ds, de, 2),
      ]);

      const inWindow = <T extends { start: number; end: number }>(xs: T[]) =>
        xs.filter((x) => x.start < de && x.end > ds);

      setBob({
        name: "Bob",
        ...splitRules(bobRules, ds, de),
        bookings: inWindow((bookMap[cal.bobId] ?? []) as Booking[]),
        net: bobNet,
      });
      setJane({
        name: "Jane",
        ...splitRules(janeRules, ds, de),
        bookings: inWindow((bookMap[cal.janeId] ?? []) as Booking[]),
        net: janeNet,
      });
      setCombined(both);
    },
    [dayStart]
  );

  // Seed + initial load.
  useEffect(() => {
    (async () => {
      try {
        const got = await ensureExplainerCalendars();
        setIds(got);
        await loadAll(got);
      } catch {
        toast.error("Failed to connect to deltat. Is it running?");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced refresh on any real-time event from either calendar, so the equation stays live.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onWsEvent = useCallback(() => {
    if (!ids) return;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => void loadAll(ids), 200);
  }, [ids, loadAll]);
  useWebSocket(ids ? { type: "subscribe", resourceId: ids.bobId, onEvent: onWsEvent } : null);
  useWebSocket(ids ? { type: "subscribe", resourceId: ids.janeId, onEvent: onWsEvent } : null);

  const firstJointMs = combined.length > 0 ? combined[0].start : null;

  let content: ReactNode;
  if (topic === "overview") {
    content = <OverviewTopic />;
  } else if (topic === "model") {
    content = <DataModelTopic />;
  } else if (topic === "recurring") {
    content = <RecurringTopic />;
  } else if (topic === "holds") {
    content = <HoldsStatic />;
  } else if (topic === "flow") {
    content = <FlowTopic />;
  } else if (topic === "stable") {
    content = <StableTopic />;
  } else if (loading) {
    content = (
      <div className="flex h-full items-center justify-center text-zinc-400">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Connecting to deltat…
        </div>
      </div>
    );
  } else {
    // The whole availability calculation as one labeled equation, read live from deltat: each person's
    // availability (open hours), minus blocked time, minus bookings, equals free. The result under the line is the
    // time both are free at once.
    const toBoxes = (
      xs: { start: number; end: number }[],
      color: BoxColor,
      text: string
    ): TimelineBox[] => xs.map((s) => ({ start: s.start, end: s.end, color, text }));
    const bookingBoxes = (xs: Booking[]): TimelineBox[] =>
      xs.map((b) => ({ start: b.start, end: b.end, color: "rose", text: b.label ?? "Booked" }));

    const personRows = (p: PersonData, blockReason: string): TimelineRow[] => [
      { label: "Availability", boxes: toBoxes(p.open, "zinc", "Availability") },
      ...(p.blocking.length ? [{ op: "−", label: "Blocked", boxes: toBoxes(p.blocking, "rose", blockReason) }] : []),
      ...(p.bookings.length ? [{ op: "−", label: "Booked", boxes: bookingBoxes(p.bookings) }] : []),
      { op: "=", label: "Free", boxes: toBoxes(p.net, "emerald", "Free") },
    ];

    const labeledRows: TimelineRow[] = [
      { heading: "Bob", boxes: [] },
      ...personRows(bob, "Lunch"),
      { heading: "Jane", boxes: [] },
      ...personRows(jane, "Blocked"),
      { divider: true, label: "Both free", boxes: toBoxes(combined, "emerald", "Both") },
    ];

    content = (
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.2em] text-zinc-500">
          <span>Availability algebra</span>
          <span className="rounded border border-white/10 px-1 py-px font-mono text-[9px] tracking-normal">
            AVAIL-01
          </span>
        </div>
        <h2 className="mt-2 text-2xl font-semibold text-zinc-100">How deltat works out free time</h2>
        <p className="mt-1 text-sm text-emerald-300/90">
          Start with each person&apos;s availability, take away the busy time, and what is left is free. Then find when two people are free at once.
        </p>

        <div className="mt-6">
          <LabeledTimeline axisStart={axisStart} axisEnd={axisEnd} labelWidth={72} rows={labeledRows} />
        </div>

        <p className="mt-4 text-[12px] leading-relaxed text-zinc-400">
          Read it like a sum. Each person starts with their availability, then deltat takes away their
          blocked time and their bookings, and what is left is free. The row under the line is when Bob
          and Jane are both free. It starts at{" "}
          {firstJointMs ? formatTime(firstJointMs) : "no shared time today"}. Every box is read live
          from deltat.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden bg-[#0a0a0c] text-zinc-100">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[55vh] w-[55vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-[130px]" />
        <div className="absolute inset-0 opacity-[0.035] [background-image:radial-gradient(circle,#ffffff_1px,transparent_1px)] [background-size:22px_22px]" />
      </div>

      <div className="relative mx-auto flex h-full max-w-6xl gap-4 px-4 py-6 sm:gap-6 sm:px-6">
        <aside className="w-40 shrink-0 overflow-auto sm:w-56">
          <div className="mb-3 px-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            How deltat works
          </div>
          <nav className="space-y-0.5">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTopic(item.id)}
                className={cn(
                  "block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
                  topic === item.id
                    ? "bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-400/20"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto pb-10">{content}</main>
      </div>
    </div>
  );
}
