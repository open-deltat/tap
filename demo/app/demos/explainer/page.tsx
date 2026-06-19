"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Stage } from "@/components/stage";
import { AlgebraExplainer, type PersonData } from "@/components/algebra/algebra-explainer";
import { StepScrubber } from "@/components/algebra/step-scrubber";
import {
  AXIS_START_HOUR,
  AXIS_END_HOUR,
  HOUR_MS,
  DAY_MS,
  clampSpans,
  type Span,
} from "@/lib/algebra";
import { toLocalDateString, formatTime } from "@/lib/time";
import type { AvailabilitySlot, Booking, Hold, Rule } from "@/lib/schemas";

import { ensureExplainerCalendars } from "@/app/actions/seed-explainer";
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

export default function ExplainerPage() {
  const [ids, setIds] = useState<Ids | null>(null);
  const [date] = useState(toLocalDateString(new Date()));
  const [bob, setBob] = useState<PersonData>(emptyPerson("Bob"));
  const [dora, setDora] = useState<PersonData>(emptyPerson("Dora"));
  const [combined, setCombined] = useState<AvailabilitySlot[]>([]);
  const [step, setStep] = useState(0);
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
      name: "Dora",
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

    // Toggle off if clicking the same window again.
    if (myHold && myHold.start === start && myHold.end === end) {
      closeAllHolds();
      return;
    }
    closeAllHolds();
    setMyHold({ start, end });
    if (step < 3) setStep(3); // surface the holds layer so the subtraction is visible

    // Both sockets must close/error before we clear the amber hold — one socket failing
    // early must not prematurely clear the hold the other is still holding.
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

  const firstJointMs = combined.length > 0 ? combined[0].start : null;

  const tray = (
    <StepScrubber
      step={step}
      playing={playing}
      onStep={(n) => {
        setPlaying(false);
        setStep(n);
      }}
      onPlayToggle={() => setPlaying((p) => !p)}
    />
  );

  return (
    <Stage
      primitive={{ label: "Availability algebra", specId: "AVAIL-01" }}
      title="How deltat computes availability"
      tray={tray}
    >
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
      <p className="mt-4 text-center text-[11px] text-zinc-500">
        Every band is a real deltat read: rules give the open band,{" "}
        <span className="text-zinc-300">getAvailability</span> gives each net, and{" "}
        <span className="text-emerald-300">getCombinedAvailability(min_available = 2)</span> gives the
        intersection — which starts at {firstJointMs ? formatTime(firstJointMs) : "—"}.
      </p>
    </Stage>
  );
}
