"use client";

import { useCallback, useState } from "react";
import type { DeltaTEvent } from "@open-deltat/client";
import { useWebSocket, type StreamStatus } from "@open-deltat/examples/hooks/use-websocket";
import { CalendarClock, CircleDot, Radio, Ticket, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CancelBookingButton } from "@/components/dashboard/calendar-admin";

// The live view of one calendar: bookings that update in real time as they happen, plus a rolling
// event log (full observability). It subscribes to the calendar's event stream over the tap
// protocol (deltat LISTEN/NOTIFY, forwarded to the browser by the demo's WebSocket bridge), so a
// booking made by anyone — a human on the public page, or an AI agent over MCP — appears here
// within a moment, no refresh.

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
}

const STATUS: Record<StreamStatus, { label: string; variant: "success" | "muted" | "secondary" }> = {
  live: { label: "Live", variant: "success" },
  connecting: { label: "Connecting…", variant: "muted" },
  expiring: { label: "Pausing soon", variant: "secondary" },
  paused: { label: "Paused", variant: "muted" },
};

let seq = 0;

export function LiveCalendar({
  calendarId,
  timezone,
  initialBookings,
}: {
  calendarId: string;
  timezone: string;
  initialBookings: LiveBooking[];
}) {
  const [bookings, setBookings] = useState<LiveBooking[]>(initialBookings);
  const [log, setLog] = useState<LogLine[]>([]);

  const fmt = useCallback(
    (ms: number) => {
      try {
        return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(ms);
      } catch {
        return new Date(ms).toISOString();
      }
    },
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

  const push = useCallback((line: Omit<LogLine, "key" | "at">) => {
    seq += 1;
    setLog((prev) => [{ ...line, key: `${Date.now()}-${seq}`, at: Date.now() }, ...prev].slice(0, 60));
  }, []);

  const onEvent = useCallback(
    (event: DeltaTEvent) => {
      if ("BookingConfirmed" in event) {
        const b = event.BookingConfirmed;
        setBookings((prev) =>
          prev.some((x) => x.id === b.id)
            ? prev
            : [...prev, { id: b.id, start: b.span.start, end: b.span.end, label: b.label }].sort((a, c) => a.start - c.start)
        );
        push({ kind: "Booking confirmed", tone: "book", detail: `${fmt(b.span.start)}${b.label ? ` · ${b.label}` : ""}` });
      } else if ("BookingCancelled" in event) {
        const id = event.BookingCancelled.id;
        setBookings((prev) => prev.filter((x) => x.id !== id));
        push({ kind: "Booking cancelled", tone: "cancel", detail: `#${id.slice(-6)}` });
      } else if ("HoldPlaced" in event) {
        const h = event.HoldPlaced;
        push({ kind: "Hold placed", tone: "hold", detail: `${fmt(h.span.start)} · expires ${clock(h.expires_at)}` });
      } else if ("HoldReleased" in event) {
        push({ kind: "Hold released", tone: "release", detail: `#${event.HoldReleased.id.slice(-6)}` });
      } else {
        const kind = Object.keys(event)[0] ?? "Event";
        push({ kind, tone: "other", detail: "" });
      }
    },
    [fmt, clock, push]
  );

  const { status } = useWebSocket({ type: "subscribe", resourceId: calendarId, onEvent });
  const badge = STATUS[status];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Ticket className="text-muted-foreground size-4" />
          {bookings.length === 0 ? "No bookings yet" : bookings.length === 1 ? "1 booking" : `${bookings.length} bookings`}
        </h3>
        <Badge variant={badge.variant} className="gap-1.5">
          <Radio className="size-3" />
          {badge.label}
        </Badge>
      </div>

      {bookings.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-lg border">
          {bookings.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="flex items-center gap-2">
                <CalendarClock className="text-muted-foreground size-4 shrink-0" />
                <span>
                  {fmt(b.start)}
                  {b.label ? <span className="text-muted-foreground"> · {b.label}</span> : null}
                </span>
              </span>
              <CancelBookingButton id={calendarId} bookingId={b.id} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">
          Share the booking link and the first booking will appear here, live.
        </div>
      )}

      {/* Observability: a rolling log of everything happening on this calendar in real time. */}
      <div className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <CircleDot className="text-muted-foreground size-4" />
          Activity
        </h3>
        <div className="bg-muted/40 h-48 overflow-y-auto rounded-lg border font-mono text-xs">
          {log.length === 0 ? (
            <p className="text-muted-foreground p-3">Waiting for events… holds, bookings, and cancellations show up here as they happen.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {log.map((l) => (
                <li key={l.key} className="flex items-start gap-2 px-3 py-1.5">
                  <span className="text-muted-foreground tabular-nums">{clock(l.at)}</span>
                  <Dot tone={l.tone} />
                  <span className="text-foreground">{l.kind}</span>
                  {l.detail ? <span className="text-muted-foreground truncate">{l.detail}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Dot({ tone }: { tone: LogLine["tone"] }) {
  const color =
    tone === "book"
      ? "bg-emerald-500"
      : tone === "cancel"
        ? "bg-red-500"
        : tone === "hold"
          ? "bg-amber-500"
          : tone === "release"
            ? "bg-muted-foreground"
            : "bg-blue-500";
  return <span className={`mt-1 size-1.5 shrink-0 rounded-full ${color}`} aria-hidden />;
}

export { X };
