"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCalendar } from "@open-deltat/examples/actions/my-bookables";
import {
  scheduleChanges,
  type HeldSpan,
  type ScheduleChange,
  type ScheduleSnapshot,
} from "@open-deltat/examples/lib/schedule-diff";
import { useWebSocket, type StreamStatus } from "@open-deltat/examples/hooks/use-websocket";
import {
  LabeledTimeline,
  type TimelineRow,
} from "@open-deltat/examples/components/labeled-timeline";
import type { WeekHours } from "@open-deltat/examples/builder";
import { ChevronLeft, ChevronRight, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@open-deltat/examples/components/ui/button";
import { BookingsMonth } from "@/components/dashboard/bookings-month";

// The daily view, the thing an operator actually looks at: a live day schedule showing open hours
// (grey), bookings (green), and active holds (amber) on an hour axis, plus a real-time activity
// log. The demo WebSocket bridge (deltat LISTEN/NOTIFY) ticks on every change and this reads the
// calendar again, so a booking by a human or an AI agent appears within a moment. The tick carries
// nothing: kernel payloads hold hold ids, which are authority, so the log is built from the reads.

const DAY = 86_400_000;

export interface LiveBooking {
  id: string;
  start: number;
  end: number;
  label: string | null;
}
interface LogLine {
  key: string;
  at: number;
  kind: string;
  tone: "book" | "cancel" | "hold" | "release" | "other";
  detail: string;
  /** The booker's name is looked up when shown, never copied into the log. */
  bookingId?: string;
}

const STATUS: Record<StreamStatus, { label: string; variant: "success" | "muted" | "secondary" }> = {
  live: { label: "Live", variant: "success" },
  connecting: { label: "Connecting…", variant: "muted" },
  expiring: { label: "Pausing soon", variant: "secondary" },
  paused: { label: "Paused", variant: "muted" },
};

const timeToMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const dayKey = (ms: number, tz: string): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
const minOfDay = (ms: number, tz: string): number => {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(ms);
  const h = Number(p.find((x) => x.type === "hour")?.value ?? 0);
  const m = Number(p.find((x) => x.type === "minute")?.value ?? 0);
  return h * 60 + m;
};

const WINDOWS = [
  { label: "10m", ms: 10 * 60_000 },
  { label: "1h", ms: 3_600_000 },
  { label: "All", ms: Number.POSITIVE_INFINITY },
] as const;

const TONES = [
  { label: "All", value: "all" },
  { label: "Bookings", value: "book" },
  { label: "Holds", value: "hold" },
] as const;

type ToneFilter = (typeof TONES)[number]["value"];

type ViewMode = "day" | "month";

// Per-calendar so a busy month-view calendar and a quiet day-view one can differ. Storage is a
// nicety, never a correctness input: any failure (private mode, disabled storage, a stale value
// from an older build) falls back to the default rather than throwing.
const modeKey = (calendarId: string) => `deltat:cal:${calendarId}:view`;

function readMode(calendarId: string): ViewMode {
  try {
    return localStorage.getItem(modeKey(calendarId)) === "month" ? "month" : "day";
  } catch {
    return "day";
  }
}

function writeMode(calendarId: string, mode: ViewMode): void {
  try {
    localStorage.setItem(modeKey(calendarId), mode);
  } catch {
    /* storage unavailable; the choice simply does not persist */
  }
}

let seq = 0;

export function LiveSchedule({
  calendarId,
  timezone,
  week,
  initialBookings,
  initialHolds,
}: {
  calendarId: string;
  timezone: string;
  week: WeekHours;
  initialBookings: LiveBooking[];
  initialHolds: HeldSpan[];
}) {
  const [bookings, setBookings] = useState<LiveBooking[]>(initialBookings);
  const [holds, setHolds] = useState<HeldSpan[]>(initialHolds);
  const [log, setLog] = useState<LogLine[]>([]);
  const [dayOffset, setDayOffset] = useState(0);
  const [windowMs, setWindowMs] = useState<number>(WINDOWS[1].ms);
  const [tone, setTone] = useState<ToneFilter>("all");
  const [mode, setMode] = useState<ViewMode>("day");

  // Remember day-vs-month per calendar: an operator who lives in the month view should not have to
  // re-pick it on every visit. Read on mount rather than in useState's initializer, because
  // localStorage does not exist during the server render.
  useEffect(() => {
    setMode(readMode(calendarId));
  }, [calendarId]);

  const chooseMode = useCallback(
    (next: ViewMode) => {
      setMode(next);
      writeMode(calendarId, next);
    },
    [calendarId]
  );

  const fmtDay = useCallback(
    (ms: number) => new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric", timeZone: timezone }).format(ms),
    [timezone]
  );
  const clock = useCallback(
    (ms: number) => {
      try {
        return new Intl.DateTimeFormat(undefined, { timeStyle: "medium", timeZone: timezone }).format(ms);
      } catch {
        return new Date(ms).toISOString();
      }
    },
    [timezone]
  );
  const timeOnly = useCallback(
    (ms: number) => new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(ms),
    [timezone]
  );

  const push = useCallback((line: Omit<LogLine, "key" | "at">) => {
    seq += 1;
    setLog((prev) => [{ ...line, key: `${Date.now()}-${seq}`, at: Date.now() }, ...prev].slice(0, 60));
  }, []);

  // Names come only from the owner's read: deltat#49 keeps them out of change notifications. A
  // booking's name never changes, so every reply adds to this, and a log line keeps its name after
  // the booking is cancelled.
  const [names, setNames] = useState<ReadonlyMap<string, string | null>>(
    () => new Map(initialBookings.map((b) => [b.id, b.label]))
  );

  const logChange = useCallback(
    (change: ScheduleChange) => {
      switch (change.kind) {
        case "booked":
          return push({ kind: "Booking confirmed", tone: "book", detail: timeOnly(change.start), bookingId: change.bookingId });
        case "cancelled":
          return push({ kind: "Booking cancelled", tone: "cancel", detail: `#${change.bookingId.slice(-6)}` });
        case "held":
          return push({ kind: "Hold placed", tone: "hold", detail: `${timeOnly(change.start)} · expires ${clock(change.expiresAt)}` });
        case "released":
          return push({ kind: "Hold released", tone: "release", detail: timeOnly(change.start) });
      }
    },
    [push, timeOnly, clock]
  );

  // Each tick asks for a read. A read goes out at most 200 ms after the first tick of a burst, so
  // steady traffic cannot starve it. Its result lands only if no tick came in after it was sent, so
  // a slow reply cannot undo a later change; that tick has already asked for the next read. The log
  // is the difference from the last read that landed.
  const shownSnapshot = useRef<ScheduleSnapshot>({ bookings: initialBookings, holds: initialHolds });
  const changes = useRef(0);
  const readTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reread = useCallback(() => {
    changes.current += 1;
    if (readTimer.current !== undefined) return;
    readTimer.current = setTimeout(() => {
      readTimer.current = undefined;
      const asked = changes.current;
      getCalendar(calendarId)
        .then((fresh) => {
          if (!fresh.ok) return;
          const { bookings: nextBookings, holds: nextHolds } = fresh.value;
          setNames((prev) => new Map([...prev, ...nextBookings.map((b) => [b.id, b.label] as const)]));
          if (asked !== changes.current) return;
          const next = { bookings: nextBookings, holds: nextHolds };
          scheduleChanges(shownSnapshot.current, next).forEach(logChange);
          shownSnapshot.current = next;
          setBookings(nextBookings);
          setHolds(nextHolds);
        })
        .catch(() => {}); // keep what is shown; the next tick reads again
    }, 200);
  }, [calendarId, logChange]);
  useEffect(
    () => () => {
      clearTimeout(readTimer.current);
      readTimer.current = undefined;
      changes.current += 1; // a reply still in flight belongs to the calendar being left
    },
    [calendarId]
  );

  // Owned calendars live in the public tenant; tell the bridge so it LISTENs on the right one.
  const { status } = useWebSocket({ type: "subscribe", resourceId: calendarId, database: "public", onChange: reread });
  const badge = STATUS[status];

  // Connecting (on mount, back from another tab, after a reconnect) means changes may have been
  // missed while away, so read.
  useEffect(() => {
    if (status === "live") reread();
  }, [status, reread]);

  const shown = useMemo(() => bookings.map((b) => ({ ...b, label: names.get(b.id) ?? null })), [bookings, names]);

  // Filtering is derived, never a second copy of the log: one source of truth, two views of it.
  const visibleLog = useMemo(() => {
    const cutoff = Number.isFinite(windowMs) ? Date.now() - windowMs : 0;
    return log.filter((l) => {
      if (l.at < cutoff) return false;
      if (tone === "all") return true;
      if (tone === "book") return l.tone === "book" || l.tone === "cancel";
      return l.tone === "hold" || l.tone === "release";
    });
  }, [log, windowMs, tone]);

  // The selected day, and everything on it, in the calendar's timezone.
  const dayMs = Date.now() + dayOffset * DAY;
  const key = dayKey(dayMs, timezone);
  const dow = new Date(`${key}T12:00:00Z`).getUTCDay();

  const view = useMemo(() => {
    const openRanges = (week[dow] ?? []).map((r) => ({ start: timeToMin(r.start), end: timeToMin(r.end) }));
    const dayBookings = shown.filter((b) => dayKey(b.start, timezone) === key);
    const dayHolds = holds.filter((h) => dayKey(h.start, timezone) === key);

    const mins = [
      ...openRanges.flatMap((r) => [r.start, r.end]),
      ...dayBookings.flatMap((b) => [minOfDay(b.start, timezone), minOfDay(b.end, timezone)]),
    ];
    const axisStart = mins.length ? Math.max(0, Math.min(...mins) - 30) : 8 * 60;
    const axisEnd = mins.length ? Math.min(1440, Math.max(...mins) + 30) : 20 * 60;

    const rows: TimelineRow[] = [];
    rows.push({
      label: "Open",
      boxes: openRanges.length
        ? openRanges.map((r) => ({ start: r.start, end: r.end, color: "zinc" as const }))
        : [],
    });
    rows.push({
      label: "Booked",
      boxes: dayBookings.map((b) => ({
        start: minOfDay(b.start, timezone),
        end: minOfDay(b.end, timezone),
        color: "emerald" as const,
        text: b.label ?? "Booked",
      })),
    });
    // Always present, even with no holds: a row that appears and disappears makes the timeline jump
    // under the cursor exactly when someone is watching a hold land.
    rows.push({
      label: "Holds",
      boxes: dayHolds.map((h) => ({
        start: minOfDay(h.start, timezone),
        end: minOfDay(h.end, timezone),
        color: "amber" as const,
        text: "hold",
      })),
    });

    const ticks: { value: number; label: string }[] = [];
    const startHour = Math.ceil(axisStart / 60);
    const endHour = Math.floor(axisEnd / 60);
    const step = endHour - startHour > 8 ? 2 : 1;
    for (let h = startHour; h <= endHour; h += step) ticks.push({ value: h * 60, label: `${h}:00` });

    return { axisStart, axisEnd, rows, ticks, count: dayBookings.length, open: openRanges.length > 0 };
  }, [week, dow, shown, holds, key, timezone]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {mode === "day" ? (
            <>
              <Button variant="ghost" size="icon-sm" onClick={() => setDayOffset((d) => d - 1)} aria-label="Previous day">
                <ChevronLeft />
              </Button>
              <span className="min-w-40 text-center text-sm font-medium">
                {dayOffset === 0 ? "Today · " : ""}
                {fmtDay(dayMs)}
              </span>
              <Button variant="ghost" size="icon-sm" onClick={() => setDayOffset((d) => d + 1)} aria-label="Next day">
                <ChevronRight />
              </Button>
            </>
          ) : (
            <span className="text-sm font-medium">Month overview</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-muted flex rounded-md p-0.5">
            {(["day", "month"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => chooseMode(m)}
                className={`rounded px-2.5 py-1 text-xs capitalize transition-colors ${
                  mode === m ? "bg-background text-foreground font-medium shadow-sm" : "text-muted-foreground"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <Badge variant={badge.variant} className="gap-1.5">
            <Radio className="size-3" />
            {badge.label}
          </Badge>
        </div>
      </div>

      {mode === "month" ? (
        <BookingsMonth
          bookings={shown}
          timezone={timezone}
          onSelectDay={(d) => {
            // Jump into that day's detail: whole-day difference from today, in the calendar's zone.
            const today = new Date(dayKey(Date.now(), timezone));
            const picked = new Date(dayKey(d.getTime(), timezone));
            setDayOffset(Math.round((picked.getTime() - today.getTime()) / DAY));
            chooseMode("day");
          }}
        />
      ) : (
        <>
          {view.open || view.count > 0 ? (
            <LabeledTimeline axisStart={view.axisStart} axisEnd={view.axisEnd} rows={view.rows} ticks={view.ticks} labelWidth={56} />
          ) : (
            <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-10 text-center text-sm">
              Closed this day. Set open hours in the Availability tab.
            </div>
          )}

          <div className="text-muted-foreground flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-dt-taken ring-1 ring-dt-line-strong" /> Open</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-dt-accent" /> Booked</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-dt-held" /> Hold</span>
          </div>
        </>
      )}

      {/* Observability: a rolling, real-time log of every hold, booking, and cancellation.
          deltat's event stream is a live tick, not a queryable history, so this starts at the
          moment the page connects; a durable log is the change-feed/cursor work. */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Activity</span>
          <div className="flex items-center gap-1">
            {WINDOWS.map((w) => (
              <button
                key={w.label}
                type="button"
                onClick={() => setWindowMs(w.ms)}
                className={`rounded-md px-2 py-1 text-xs transition-colors ${
                  windowMs === w.ms ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {w.label}
              </button>
            ))}
            <span className="bg-border mx-1 h-4 w-px" />
            {TONES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTone(t.value)}
                className={`rounded-md px-2 py-1 text-xs transition-colors ${
                  tone === t.value ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-muted/40 h-80 overflow-y-auto rounded-lg border font-mono text-xs">
          {visibleLog.length === 0 ? (
            <p className="text-muted-foreground p-3">
              {log.length === 0
                ? "Watching… holds, bookings, and cancellations appear here the moment they happen."
                : "Nothing in this window. Widen the time range or clear the filter."}
            </p>
          ) : (
            <ul className="divide-border/60 divide-y">
              {visibleLog.map((l) => (
                <li key={l.key} className="flex items-start gap-2 px-3 py-1.5">
                  <span className="text-muted-foreground tabular-nums">{clock(l.at)}</span>
                  <span className={`mt-1 size-1.5 shrink-0 rounded-full ${dotColor(l.tone)}`} aria-hidden />
                  <span className="text-foreground">{l.kind}</span>
                  {l.detail ? (
                    <span className="text-muted-foreground truncate">
                      {l.detail}
                      {l.bookingId && names.get(l.bookingId) ? ` · ${names.get(l.bookingId)}` : null}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function dotColor(tone: LogLine["tone"]): string {
  return tone === "book"
    ? "bg-dt-accent"
    : tone === "cancel"
      ? "bg-destructive"
      : tone === "hold"
        ? "bg-dt-held"
        : tone === "release"
          ? "bg-muted-foreground"
          : "bg-dt-ink-3";
}
