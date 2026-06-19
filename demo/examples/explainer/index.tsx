"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AlgebraExplainer, type PersonData } from "./algebra/algebra-explainer";
import { StepScrubber } from "./algebra/step-scrubber";
import { HoldsNarrative } from "./holds/holds-narrative";
import { FEATURE_TOPICS, TopicCard } from "./topics";
import {
  AXIS_START_HOUR,
  AXIS_END_HOUR,
  HOUR_MS,
  DAY_MS,
  STEP_COUNT,
  clampSpans,
  type Span,
} from "./algebra";
import { toLocalDateString, formatTime } from "@/lib/time";
import type { AvailabilitySlot, Booking, Hold, Rule } from "@/lib/schemas";

import { ensureExplainerCalendars } from "./seed";
import { getAvailability, getCombinedAvailability } from "@/app/actions/availability";
import { getRulesForResource } from "@/app/actions/rules";
import { getMultiResourceBookings } from "@/app/actions/bookings";
import { getMultiResourceHolds } from "@/app/actions/holds";
import { useWebSocket, wsUrl } from "@/hooks/use-websocket";

const HOLD_MINUTES = 60; // window length the click snaps to
const MIN_DURATION_MS = 60 * 60_000;

interface Ids {
  bobId: string;
  doraId: string;
}

// Sidebar: two interactive walkthroughs, then the feature explainers.
const NAV: { id: string; label: string }[] = [
  { id: "algebra", label: "Availability algebra" },
  { id: "holds", label: "Holds & races" },
  ...FEATURE_TOPICS.map((t) => ({ id: t.id, label: t.label })),
];

const emptyPerson = (name: string): PersonData => ({
  name,
  open: [],
  blocking: [],
  bookings: [],
  holds: [],
  net: [],
  bufferMs: 0,
});

function splitRules(rules: Rule[], ds: number, de: number): { open: Span[]; blocking: Span[] } {
  const open = clampSpans(rules.filter((r) => !r.blocking), ds, de);
  const blocking = clampSpans(rules.filter((r) => r.blocking), ds, de);
  return { open, blocking };
}

export default function ExplainerExample() {
  const [topic, setTopic] = useState<string>("algebra");
  const [ids, setIds] = useState<Ids | null>(null);
  const [date] = useState(toLocalDateString(new Date()));
  const [bob, setBob] = useState<PersonData>(emptyPerson("Bob"));
  const [dora, setDora] = useState<PersonData>(emptyPerson("Jane"));
  const [combined, setCombined] = useState<AvailabilitySlot[]>([]);
  // Open on the END RESULT (the full picture is clean enough to read at a glance); the play
  // button then walks through the algebra from step 1.
  const [step, setStep] = useState(STEP_COUNT - 1);
  const [playing, setPlaying] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<"bob" | "dora">>(new Set());
  const [myHold, setMyHold] = useState<{ start: number; end: number } | null>(null);
  const [loading, setLoading] = useState(true);

  // One raw WS hold socket per resource — open = hold active, close = released.
  const holdWsRef = useRef(new Map<string, WebSocket>());

  const dayStart = new Date(`${date}T00:00`).getTime();
  const axisStart = dayStart + AXIS_START_HOUR * HOUR_MS;
  const axisEnd = dayStart + AXIS_END_HOUR * HOUR_MS;

  const closeAllHolds = useCallback(() => {
    for (const ws of holdWsRef.current.values()) ws.close();
    holdWsRef.current.clear();
    setMyHold(null);
  }, []);

  const loadAll = useCallback(async (cal: Ids) => {
    const ds = dayStart;
    const de = ds + DAY_MS;
    const now = Date.now();

    const [bobRules, doraRules] = await Promise.all([
      getRulesForResource(cal.bobId),
      getRulesForResource(cal.doraId),
    ]);
    const bookMap = await getMultiResourceBookings([cal.bobId, cal.doraId]);
    const holdMap = await getMultiResourceHolds([cal.bobId, cal.doraId]);
    const [bobNet, doraNet, both] = await Promise.all([
      getAvailability(cal.bobId, ds, de),
      getAvailability(cal.doraId, ds, de),
      getCombinedAvailability([cal.bobId, cal.doraId], ds, de, 2),
    ]);

    const inWindow = <T extends { start: number; end: number }>(xs: T[]) =>
      xs.filter((x) => x.start < de && x.end > ds);
    const liveHolds = (xs: Hold[]) => inWindow(xs).filter((h) => h.expiresAt > now);

    const bobSplit = splitRules(bobRules, ds, de);
    const doraSplit = splitRules(doraRules, ds, de);

    setBob({
      name: "Bob",
      ...bobSplit,
      bookings: inWindow((bookMap[cal.bobId] ?? []) as Booking[]),
      holds: liveHolds((holdMap[cal.bobId] ?? []) as Hold[]),
      net: bobNet,
      bufferMs: 0,
    });
    setDora({
      name: "Jane",
      ...doraSplit,
      bookings: inWindow((bookMap[cal.doraId] ?? []) as Booking[]),
      holds: liveHolds((holdMap[cal.doraId] ?? []) as Hold[]),
      net: doraNet,
      bufferMs: 0,
    });
    setCombined(both);
  }, [dayStart]);

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

  // Cleanup hold sockets on unmount.
  useEffect(() => () => closeAllHolds(), [closeAllHolds]);

  // Debounced refresh on any real-time event from either calendar.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onWsEvent = useCallback(() => {
    if (!ids) return;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => void loadAll(ids), 200);
  }, [ids, loadAll]);
  useWebSocket(ids ? { type: "subscribe", resourceId: ids.bobId, onEvent: onWsEvent } : null);
  useWebSocket(ids ? { type: "subscribe", resourceId: ids.doraId, onEvent: onWsEvent } : null);

  // Place a 60-min hold on BOTH resources via two raw sockets (server TTL = 5 min).
  function placeHold(slot: AvailabilitySlot) {
    if (!ids) return;
    if (slot.end - slot.start < MIN_DURATION_MS) return;
    const start = slot.start;
    const end = slot.start + HOLD_MINUTES * 60_000;

    if (myHold && myHold.start === start && myHold.end === end) {
      closeAllHolds();
      return;
    }
    closeAllHolds();
    setMyHold({ start, end });
    if (step < 3) setStep(3); // surface the holds layer so the subtraction is visible

    const pending = new Set([ids.bobId, ids.doraId]);
    for (const resourceId of [ids.bobId, ids.doraId]) {
      const ws = new WebSocket(wsUrl());
      const revert = () => {
        holdWsRef.current.delete(resourceId);
        pending.delete(resourceId);
        if (pending.size === 0) setMyHold(null);
      };
      ws.onopen = () => ws.send(JSON.stringify({ type: "hold", resourceId, start, end }));
      ws.onerror = revert;
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data));
          if (data?.type === "error") {
            ws.close();
            revert();
            toast.error("That slot was just taken");
          }
        } catch {
          // deltat event frame — ignore
        }
      };
      holdWsRef.current.set(resourceId, ws);
    }
  }

  function toggleCollapse(who: "bob" | "dora") {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(who)) next.delete(who);
      else next.add(who);
      return next;
    });
  }

  const firstJointMs = combined.length > 0 ? combined[0].start : null;
  const featureTopic = FEATURE_TOPICS.find((t) => t.id === topic);

  let content: ReactNode;
  if (topic === "holds") {
    content = <HoldsNarrative />;
  } else if (featureTopic) {
    content = <TopicCard topic={featureTopic} />;
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
    content = (
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.2em] text-zinc-500">
          <span>Availability algebra</span>
          <span className="rounded border border-white/10 px-1 py-px font-mono text-[9px] tracking-normal">
            AVAIL-01
          </span>
        </div>
        <h2 className="mt-2 text-2xl font-semibold text-zinc-100">How deltat computes availability</h2>
        <p className="mt-1 text-sm text-emerald-300/90">
          Open hours minus blocks minus bookings minus holds — then the intersection of two people.
        </p>

        <div className="mt-6">
          <AlgebraExplainer
            bob={bob}
            dora={dora}
            combined={combined}
            axisStart={axisStart}
            axisEnd={axisEnd}
            step={step}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
            myHold={myHold}
            onPickIntersection={placeHold}
            firstJointMs={firstJointMs}
            minDurationMs={MIN_DURATION_MS}
          />
        </div>

        <div className="mt-5">
          <StepScrubber
            step={step}
            playing={playing}
            onStep={(n) => {
              setPlaying(false);
              setStep(n);
            }}
            onPlayToggle={() => {
              if (!playing && step >= STEP_COUNT - 1) {
                setStep(0);
                setPlaying(true);
              } else {
                setPlaying((p) => !p);
              }
            }}
          />
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">
          Every band is a real deltat read: rules give the open band,{" "}
          <span className="text-zinc-300">getAvailability</span> gives each net, and{" "}
          <span className="text-emerald-300">getCombinedAvailability(min_available = 2)</span> gives the
          intersection — which starts at {firstJointMs ? formatTime(firstJointMs) : "—"}.
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
