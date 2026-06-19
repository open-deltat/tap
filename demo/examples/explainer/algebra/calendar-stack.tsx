"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/time";
import { LayerTrack } from "./layer-track";
import { STEP_CAPTIONS, type Span } from "../algebra";
import type { Booking, Hold } from "@/lib/schemas";

interface CalendarStackProps {
  name: string;
  open: Span[];
  blocking: Span[];
  bookings: Booking[];
  holds: Hold[];
  /** Engine-truth net availability (dt.availability.get). */
  net: Span[];
  bufferMs: number;
  axisStart: number;
  axisEnd: number;
  step: number;
  collapsed: boolean;
  onToggle: () => void;
}

const rangeLabel = (spans: Span[]): string => {
  if (spans.length === 0) return "(none)";
  const lo = spans.reduce((m, s) => Math.min(m, s.start), spans[0].start);
  const hi = spans.reduce((m, s) => Math.max(m, s.end), spans[0].end);
  return `${formatTime(lo)}–${formatTime(hi)}`;
};

export function CalendarStack({
  name,
  open,
  blocking,
  bookings,
  holds,
  net,
  bufferMs,
  axisStart,
  axisEnd,
  step,
  collapsed,
  onToggle,
}: CalendarStackProps) {
  const visible = new Set(STEP_CAPTIONS[step]?.layers ?? []);
  const netVisible = visible.has("net");

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-300 hover:text-zinc-100"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {name}
        {collapsed && (
          <span className="ml-2 font-normal normal-case tracking-normal text-emerald-300/80">
            net {rangeLabel(net)}
          </span>
        )}
      </button>

      {collapsed ? (
        <div className="pl-1">
          <LayerTrack
            kind="net"
            rowLabel="= net"
            summary={rangeLabel(net)}
            spans={net}
            ghostUnder={open}
            axisStart={axisStart}
            axisEnd={axisEnd}
          />
        </div>
      ) : (
        <div className="space-y-1">
          {visible.has("open") && (
            <LayerTrack
              kind="open"
              rowLabel="open"
              summary={rangeLabel(open)}
              spans={open}
              axisStart={axisStart}
              axisEnd={axisEnd}
            />
          )}
          {visible.has("blocking") && (
            <LayerTrack
              kind="blocking"
              rowLabel="− blocking"
              summary={blocking.length ? rangeLabel(blocking) : "(none)"}
              spans={blocking}
              ghostUnder={open}
              axisStart={axisStart}
              axisEnd={axisEnd}
            />
          )}
          {visible.has("booking") && (
            <LayerTrack
              kind="booking"
              rowLabel="− bookings"
              summary={bookings.length ? `${bookings.length} appt` : "(none)"}
              bookings={bookings}
              bufferMs={bufferMs}
              ghostUnder={open}
              axisStart={axisStart}
              axisEnd={axisEnd}
            />
          )}
          {visible.has("hold") && (
            <LayerTrack
              kind="hold"
              rowLabel="− holds"
              summary={holds.length ? `${holds.length} hold` : "(none)"}
              holds={holds}
              ghostUnder={open}
              axisStart={axisStart}
              axisEnd={axisEnd}
            />
          )}
          <div className={cn("transition-opacity duration-300", !netVisible && "opacity-30")}>
            <LayerTrack
              kind="net"
              rowLabel="= net"
              summary={rangeLabel(net)}
              spans={net}
              ghostUnder={open}
              axisStart={axisStart}
              axisEnd={axisEnd}
              dim={!netVisible}
            />
          </div>
        </div>
      )}
    </div>
  );
}
