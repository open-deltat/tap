"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast, type ExternalToast } from "sonner";
import { cn } from "@open-deltat/shared/utils";
import { formatTimeRange } from "@open-deltat/shared/time";
import { Stage } from "../../components/stage";
import { TimeField } from "../../components/time-field";
import { MAX_SPAN_MS, longDay as longDate } from "../../components/time-field-shared";
import { BookingConfirmedModal, type BookingResult } from "../../components/booking-confirmed-modal";
import {
  HOUR_MS,
  axisOf,
  clock,
  groupByDay,
  mergeSlots,
  midnightOf,
  nearestFits,
  sliceSlots,
  stepSpan,
  widenAxis,
  type Axis,
  type BusySlot,
  type Slot,
} from "../../lib/day-field";
import { formatError } from "../../lib/format-error";
import type { Resource } from "../../lib/schemas";
import { bookHeldSeats, cancelMyBooking } from "../../actions/bookings";
import { useSlotHold } from "../../hooks/use-slot-hold";
import { useWebSocket, type StreamStatus } from "../../hooks/use-websocket";
import { seedAvailabilityScheduler } from "./seed";
import { useFieldData } from "./use-field-data";
import { FieldTray } from "./field-tray";
import { FieldSkeleton } from "./field-skeleton";

const SLOT_MINUTES = 30;
const SLOT_MS = SLOT_MINUTES * 60_000;
const NAME = "Dr. Sarah Chen";
const PRIMITIVE = { label: "Free time is open hours minus what is booked", specId: "AVAIL-01" } as const;
const ALTERNATIVES_MS = 15_000;
/** Our own hold, as it comes off the server a moment after it is released, must not be drawn as someone else's. */
const OWN_HOLD_GRACE_MS = 2_000;
/** If the server has not shown a hold by now it is not coming: say so rather than wait on a phantom. */
const HOLD_CONFIRM_MS = 4_000;
// Toasts go to the top: the bottom right is where the Book button sits.
const AT_TOP = { position: "top-center" } as const satisfies ExternalToast;

const initials = (name: string) =>
  name
    .split(" ")
    .filter((word) => !word.endsWith("."))
    .map((word) => word[0])
    .join("")
    .slice(0, 2);

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " ");
const dayAndTime = (ms: number) => `${new Date(ms).toLocaleDateString(undefined, { weekday: "short" })} ${clock(ms)}`;

function asResource(id: string): Resource {
  return { id, parentId: null, name: NAME, capacity: 1, bufferAfter: null, slotMinutes: SLOT_MINUTES, price: null, bufferMinutes: 0 };
}

export default function AvailabilityExample() {
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [selection, setSelection] = useState<Slot | null>(null);
  const [managedId, setManagedId] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<Slot[]>([]);
  const [watched, setWatched] = useState<ReadonlyMap<number, Slot>>(new Map());
  const [result, setResult] = useState<BookingResult | null>(null);
  const [isBooking, startBooking] = useTransition();
  const [isCancelling, startCancelling] = useTransition();

  const recentMine = useRef<{ span: Slot; until: number }[]>([]);
  const selectionRef = useRef<Slot | null>(null);
  selectionRef.current = selection;
  const axisRef = useRef<Axis | null>(null);
  const alternativesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Every interval the visitor chose lately, so what they did is not reported back to them as news.
  const ownSpans = useCallback(
    () => [...(selectionRef.current ? [selectionRef.current] : []), ...recentMine.current.filter((r) => r.until > Date.now()).map((r) => r.span)],
    []
  );
  const data = useFieldData(resourceId, SLOT_MS, ownSpans);
  const stream = useWebSocket(resourceId ? { type: "subscribe", resourceId, onEvent: data.onEvent } : null);
  const snap = data.snapshot;

  // What the schedule says, whatever the visitor has chosen: rebuilt only when a new read arrives.
  const base = useMemo(() => {
    if (!snap) return null;
    const free = sliceSlots(snap.free, SLOT_MS).filter((s) => s.end > data.now);
    const rows = groupByDay(free, data.starts, snap.holds, snap.busy);
    const axis = widenAxis(axisRef.current, axisOf([...free, ...snap.holds, ...snap.busy]));
    axisRef.current = axis;
    return { free, rows, axis };
  }, [snap, data.now, data.starts]);

  const mineHold = useMemo(() => (snap && selection ? (snap.holds.find((h) => h.start === selection.start && h.end === selection.end) ?? null) : null), [snap, selection]);

  // The choice, laid over the schedule. Only the rows the choice touches are rebuilt; every other row keeps
  // its identity, so a click on a field of thousands of cells redraws one row, not all of them. A chosen
  // slot is always a cell, whether or not the hold on it has landed, and our own hold, or one we have only
  // just let go of, is never drawn as somebody else's.
  const rows = useMemo(() => {
    if (!base) return null;
    const recent = recentMine.current.filter((r) => r.until > Date.now()).map((r) => r.span);
    const own = selection ? sliceSlots([selection], SLOT_MS) : [];
    const touched = new Set([...own.map((s) => midnightOf(s.start)), ...recent.map((r) => midnightOf(r.start))]);
    if (touched.size === 0) return base.rows;
    const isOwnHold = (h: Slot) => h === mineHold || recent.some((r) => r.start === h.start && r.end === h.end);
    return base.rows.map((row) =>
      touched.has(row.dayStart)
        ? { ...row, slots: mergeSlots(row.slots, own.filter((s) => midnightOf(s.start) === row.dayStart)), held: row.held.filter((h) => !isOwnHold(h)) }
        : row
    );
  }, [base, selection, mineHold]);

  // The open times on the chosen day, for stepping the interval longer or shorter.
  const daySlots = useMemo(() => (selection && rows ? (rows.find((r) => r.dayStart === midnightOf(selection.start))?.slots ?? []) : []), [rows, selection]);
  const daySlotsRef = useRef(daySlots);
  daySlotsRef.current = daySlots;

  const watchedStarts = useWatchedStarts(watched);
  const managed: BusySlot | null = useMemo(() => snap?.busy.find((b) => b.mine && b.id === managedId) ?? null, [snap, managedId]);

  useEffect(() => {
    seedAvailabilityScheduler()
      .then(setResourceId)
      .catch(() => {
        setUnreachable(true);
        toast.error("Failed to connect to Δt. Is it running?", AT_TOP);
      });
  }, []);

  const rememberMine = useCallback((span: Slot) => {
    recentMine.current = [...recentMine.current.filter((r) => r.until > Date.now()), { span, until: Date.now() + OWN_HOLD_GRACE_MS }].slice(-6);
  }, []);

  const choose = useCallback(
    (span: Slot) => {
      const prev = selectionRef.current;
      if (prev && prev.start === span.start && prev.end === span.end) return;
      if (prev) rememberMine(prev);
      setManagedId(null);
      setAlternatives([]);
      setSelection(span);
    },
    [rememberMine]
  );

  const clearSelection = useCallback(() => {
    if (selectionRef.current) rememberMine(selectionRef.current);
    setSelection(null);
  }, [rememberMine]);

  // A time we could not hold: say so, and offer the nearest places the same length of time is open.
  const slotsRef = useRef<Slot[]>([]);
  slotsRef.current = base?.free ?? [];
  const refuse = useCallback((span: Slot) => {
    setSelection(null);
    const fits = nearestFits(slotsRef.current, span, SLOT_MS, 3);
    setAlternatives(fits);
    if (alternativesTimer.current) clearTimeout(alternativesTimer.current);
    alternativesTimer.current = setTimeout(() => setAlternatives([]), ALTERNATIVES_MS);
    toast.message(`${dayAndTime(span.start)} was just taken`, { description: fits.length ? "The nearest free times are ringed." : "Nothing else is open nearby.", ...AT_TOP });
  }, []);
  useEffect(() => () => (alternativesTimer.current ? clearTimeout(alternativesTimer.current) : undefined), []);

  useSlotHold(resourceId, selection, refuse);

  // The server decides whether a hold exists. If it never shows ours, the time was lost.
  const holdLanded = mineHold != null;
  useEffect(() => {
    if (!selection || holdLanded || !snap) return;
    const timer = setTimeout(() => refuse(selection), HOLD_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [selection, holdLanded, snap, refuse]);

  // A hold that runs out gives the time back; the choice goes with it.
  const holdExpiry = mineHold?.expiresAt;
  useEffect(() => {
    if (holdExpiry === undefined) return;
    const timer = setTimeout(() => {
      clearSelection();
      toast.message("Your hold ran out", { description: "Pick the time again to hold it.", ...AT_TOP });
    }, Math.max(0, holdExpiry - (Date.now() + data.skew)));
    return () => clearTimeout(timer);
  }, [holdExpiry, data.skew, clearSelection]);

  // Escape lets go of a choice.
  useEffect(() => {
    if (!selection && !managedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      clearSelection();
      setManagedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, managedId, clearSelection]);

  // "Tell me if it opens": the one honest slice of standing queries today. It watches the stream and says so
  // when the time is free. It does not hold it for you: that grant is the engine's to make, and not built.
  const watchedRef = useRef(watched);
  watchedRef.current = watched;
  useEffect(() => {
    if (!base || watchedRef.current.size === 0) return;
    const open = new Set(base.free.map((s) => s.start));
    const opened = [...watchedRef.current.values()].filter((span) => open.has(span.start));
    if (opened.length === 0) return;
    setWatched((prev) => new Map([...prev].filter(([start]) => !opened.some((o) => o.start === start))));
    for (const span of opened) {
      toast(`${dayAndTime(span.start)} just opened`, {
        duration: 12_000,
        action: { label: "Hold it", onClick: () => choose({ start: span.start, end: span.start + SLOT_MS }) },
        ...AT_TOP,
      });
    }
  }, [base, choose]);

  const watch = useCallback((span: Slot) => {
    // Read the current state, say so once, then update: a toast inside an updater would fire twice.
    const already = watchedRef.current.has(span.start);
    setWatched((prev) => {
      const next = new Map(prev);
      if (already) next.delete(span.start);
      else next.set(span.start, span);
      return next;
    });
    if (already) toast.message("Stopped watching", AT_TOP);
    else toast.message(`Watching ${dayAndTime(span.start)}`, { description: "You will be told if it opens.", ...AT_TOP });
  }, []);

  const manage = useCallback(
    (booking: BusySlot) => {
      clearSelection();
      setAlternatives([]);
      setManagedId(booking.id ?? null);
    },
    [clearSelection]
  );

  const step = useCallback(
    (direction: 1 | -1) => {
      const prev = selectionRef.current;
      if (!prev) return;
      const next = stepSpan(daySlotsRef.current, prev, direction, SLOT_MS, MAX_SPAN_MS);
      if (next.end !== prev.end) choose(next);
    },
    [choose]
  );

  function book() {
    if (!selection || !resourceId) return;
    const span = selection;
    const rid = resourceId;
    startBooking(async () => {
      try {
        const bookings = await bookHeldSeats({ seatIds: [rid], start: span.start, end: span.end, label: "Appointment" });
        rememberMine(span);
        setSelection(null); // closing the choice releases the hold; the booking has replaced it
        setResult({
          title: `Appointment · ${NAME}`,
          subtitle: `${longDate(span.start)} · ${formatTimeRange(span.start, span.end)}`,
          bookings,
          resources: [asResource(rid)],
        });
      } catch (err) {
        toast.error(formatError(err instanceof Error ? err.message : String(err)), AT_TOP);
        refuse(span);
      }
      await data.refresh();
    });
  }

  function cancel() {
    if (!managed?.id) return;
    const id = managed.id;
    startCancelling(async () => {
      try {
        await cancelMyBooking(id);
        setManagedId(null);
      } catch (err) {
        toast.error(formatError(err instanceof Error ? err.message : String(err)), AT_TOP);
      }
      await data.refresh();
    });
  }

  const grown = selection ? stepSpan(daySlots, selection, 1, SLOT_MS, MAX_SPAN_MS) : null;
  const tray = (
    <FieldTray
      selection={selection}
      held={mineHold}
      booking={isBooking}
      managed={managed}
      skew={data.skew}
      slotMs={SLOT_MS}
      canGrow={!!selection && !!grown && grown.end !== selection.end}
      canShrink={!!selection && selection.end - selection.start > SLOT_MS}
      onStep={step}
      onBook={book}
      onCancel={cancel}
      cancelling={isCancelling}
    />
  );

  const hasMine = !!snap?.busy.some((b) => b.mine);
  const status: StreamStatus = resourceId ? stream.status : "connecting";

  return (
    <>
      <Stage primitive={PRIMITIVE} readout={<StreamReadout status={status} />} flush tray={tray}>
        <PanelHeader loading={!base} open={base?.free.length ?? 0} days={data.starts.length} />
        {unreachable ? (
          <p className="px-4 py-10 text-sm text-ink-2 sm:px-5">Δt is not reachable right now. Is it running?</p>
        ) : base && rows ? (
          <TimeField
            rows={rows}
            axis={base.axis}
            slotMs={SLOT_MS}
            selected={selection}
            onSelect={choose}
            managed={managed}
            onManage={manage}
            watched={watchedStarts}
            onWatch={watch}
            alternatives={alternatives}
            taken={data.taken}
            now={data.now}
            skew={data.skew}
            bookingTtlMs={snap?.bookingTtlMs ?? 30_000}
            more={data.more}
          />
        ) : (
          <FieldSkeleton />
        )}
        <Legend
          feed={data.feed}
          alternatives={alternatives}
          onPickAlternative={choose}
          hasMine={hasMine}
          hasWatch={watched.size > 0}
          nowOnLine={base ? nowOnLine(data.now, base.axis) : false}
          idle={!selection && !managed}
        />
      </Stage>

      <BookingConfirmedModal result={result} onClose={() => setResult(null)} onBookAnother={() => setResult(null)} />
    </>
  );
}

// The field reads which spans are watched by their start; one stable set per change of the map.
function useWatchedStarts(watched: ReadonlyMap<number, Slot>): ReadonlySet<number> {
  return useMemo(() => new Set(watched.keys()), [watched]);
}

const nowOnLine = (now: number, axis: Axis) => {
  const hour = (now - midnightOf(now)) / HOUR_MS;
  return hour > axis.fromHour && hour < axis.toHour;
};

function PanelHeader({ loading, open, days }: { loading: boolean; open: number; days: number }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[3px] border border-line-strong font-mono text-sm text-ink">
          {initials(NAME)}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-medium tracking-tight text-ink">{NAME}</h2>
          {/* No zone while loading: the server cannot know it, and the two renders must match. */}
          <p className="truncate font-mono text-xs tabular-nums text-ink-2">{loading ? `${SLOT_MINUTES} min` : `${SLOT_MINUTES} min · ${timeZone()}`}</p>
        </div>
      </div>
      <p className="shrink-0 font-mono text-xs tabular-nums text-ink-2">
        {loading ? (
          "reading…"
        ) : (
          <>
            <span className="text-ink">{open}</span> open · {days} days
          </>
        )}
      </p>
    </div>
  );
}

const SWATCH = "inline-block size-2.5 align-[-1px]";

// What each mark means, in words as well as colour, and the one line that says what just changed.
function Legend({
  feed,
  alternatives,
  onPickAlternative,
  hasMine,
  hasWatch,
  nowOnLine: showNow,
  idle,
}: {
  feed: string | null;
  alternatives: readonly Slot[];
  onPickAlternative: (span: Slot) => void;
  hasMine: boolean;
  hasWatch: boolean;
  nowOnLine: boolean;
  idle: boolean;
}) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line px-4 py-2 text-xs text-ink-2 sm:px-5">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          <span aria-hidden className={cn(SWATCH, "bg-signal/50")} /> open
        </span>
        <span>
          <span aria-hidden className={cn(SWATCH, "bg-signal")} /> your choice
        </span>
        <span>
          <span aria-hidden className={cn(SWATCH, "border border-hold/70 [background-image:repeating-linear-gradient(135deg,color-mix(in_oklab,var(--hold)_55%,transparent)_0_2px,transparent_2px_5px)]")} /> held
        </span>
        <span>
          <span aria-hidden className={cn(SWATCH, "bg-ink/25")} /> booked
        </span>
        {hasMine && (
          <span>
            <span aria-hidden className={cn(SWATCH, "bg-ink")} /> yours
          </span>
        )}
        {hasWatch && (
          <span>
            <span aria-hidden className={cn(SWATCH, "outline-1 outline-dotted outline-signal")} /> watching
          </span>
        )}
        {showNow && (
          <span className="hidden sm:inline">
            <span aria-hidden className="mr-1 inline-block h-2.5 w-px bg-ink align-[-1px]" />
            now
          </span>
        )}
      </p>

      <div role="status" aria-live="polite" className="min-w-0">
        {alternatives.length > 0 ? (
          <p className="flex flex-wrap items-center gap-2">
            <span>Nearest free:</span>
            {alternatives.map((a) => (
              <button
                key={a.start}
                type="button"
                onClick={() => onPickAlternative(a)}
                className="min-h-11 rounded-[3px] border border-signal/50 px-2 font-mono tabular-nums text-signal outline-none transition-colors hover:bg-signal/10 focus-visible:ring-2 focus-visible:ring-signal sm:min-h-7"
              >
                {dayAndTime(a.start)}
              </button>
            ))}
          </p>
        ) : feed ? (
          <p className="font-mono tabular-nums text-hold">{feed}</p>
        ) : idle ? (
          <p>Pick a time and it is held for you while you decide.</p>
        ) : null}
      </div>
    </div>
  );
}

const STREAM_WORDS: Record<StreamStatus, { word: string; tone: string }> = {
  live: { word: "live", tone: "bg-signal" },
  connecting: { word: "connecting", tone: "bg-ink-3" },
  expiring: { word: "pausing soon", tone: "bg-hold" },
  paused: { word: "paused, times may be stale", tone: "bg-hold" },
};

function StreamReadout({ status }: { status: StreamStatus }) {
  const { word, tone } = STREAM_WORDS[status];
  return (
    // A fixed minimum width: "connecting" is wider than "live", and a caption that rewraps when the word
    // changes moves the whole panel.
    <p className="flex min-w-[6.5rem] items-center justify-end gap-2 font-mono text-xs text-ink-2">
      <span aria-hidden className={cn("size-1.5", tone, status === "live" && "motion-safe:animate-pulse")} />
      {word}
    </p>
  );
}
