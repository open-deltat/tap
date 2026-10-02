"use client";

import { useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";
import type { Axis, BusySlot, DayRow, Slot } from "../lib/day-field";

/**
 * The narrowest a slot may be drawn. Below this the track stops shrinking and scrolls sideways. Chosen so
 * the default 9 to 5 day at 30-minute slots (16 cells) fits the widest panel without scrolling, and a
 * 24-hour day or a five-minute slot scrolls instead of crushing the cells.
 */
export const MIN_CELL_PX = 52;
/** Below this width the field is a strip of days and a grid of times: a 20px segment cannot be tapped. */
export const WIDE_FROM_PX = 640;
/** Longest interval a person can choose: a hold takes time out of circulation, so it stays short. */
export const MAX_SPAN_MS = 4 * 3_600_000;
/** How long a hold lasts when nothing else says: the demo server's own figure, used to scale the timer bar. */
export const HOLD_TTL_MS = 300_000;

export type TakenSlot = Slot & { key: number };

export interface FieldProps {
  rows: readonly DayRow[];
  axis: Axis;
  slotMs: number;
  /** The chosen interval, one slot or several. */
  selected: Slot | null;
  onSelect: (span: Slot) => void;
  /** The visitor's own booking they are looking at. */
  managed: BusySlot | null;
  onManage: (booking: BusySlot) => void;
  /** Start times of held or booked spans the visitor asked to hear about. */
  watched: ReadonlySet<number>;
  onWatch: (span: Slot) => void;
  /** Where else the same length of time is open, after a lost race. */
  alternatives: readonly Slot[];
  taken: readonly TakenSlot[];
  now: number;
  /** Server clock minus this page's clock, so a countdown runs on the server's time. */
  skew: number;
  /** How long a booking lives in this demo, for its timer bar. */
  bookingTtlMs: number;
  more: { loading: boolean; done: boolean; onNeed: () => void };
}

/** A slot's left edge and width as shares of the axis, clamped to the day so nothing spills out of its row. */
export function place(span: Slot, dayStart: number, axis: Axis): CSSProperties {
  const total = (axis.toHour - axis.fromHour) * 3_600_000;
  const left = Math.max(0, ((span.start - dayStart - axis.fromHour * 3_600_000) / total) * 100);
  const width = Math.min(100 - left, ((span.end - span.start) / total) * 100);
  return { left: `${left}%`, width: `${Math.max(0, width)}%` };
}

export const centreOf = (span: Slot, dayStart: number, axis: Axis): number => {
  const total = (axis.toHour - axis.fromHour) * 3_600_000;
  return (((span.start + span.end) / 2 - dayStart - axis.fromHour * 3_600_000) / total) * 100;
};

const fmt = (ms: number, options: Intl.DateTimeFormatOptions) => new Date(ms).toLocaleDateString(undefined, options);
export const shortDay = (dayStart: number) => `${fmt(dayStart, { weekday: "short" }).toUpperCase()} ${String(new Date(dayStart).getDate()).padStart(2, "0")}`;
export const longDay = (dayStart: number) => fmt(dayStart, { weekday: "long", month: "long", day: "numeric" });
export const weekdayShort = (ms: number) => fmt(ms, { weekday: "short" });

/** "OCT 2026", or "OCT to NOV 2026" when the loaded days cross a month. */
export function monthSpan(rows: readonly DayRow[]): string {
  const first = rows[0]?.dayStart;
  const last = rows[rows.length - 1]?.dayStart;
  if (first === undefined || last === undefined) return "";
  const month = (ms: number) => fmt(ms, { month: "short" }).toUpperCase();
  const year = new Date(last).getFullYear();
  return month(first) === month(last) ? `${month(first)} ${year}` : `${month(first)} to ${month(last)} ${year}`;
}

export function groupByDayStart<T extends Slot>(items: readonly T[], dayOf: (ms: number) => number): Map<number, T[]> {
  return items.reduce((map, item) => {
    const key = dayOf(item.start);
    map.set(key, [...(map.get(key) ?? []), item]);
    return map;
  }, new Map<number, T[]>());
}

/**
 * A bar that shrinks to nothing as a hold or booking runs out, on the compositor and without a timer:
 * the animation starts part-way through, at the point the server's clock says it already is.
 */
export function TimerBar({ until, totalMs, skew, className }: { until: number; totalMs: number; skew: number; className?: string }) {
  const [left] = useState(() => Math.max(0, until - (Date.now() + skew)));
  const elapsed = Math.max(0, totalMs - left);
  return (
    <span
      aria-hidden
      className={className}
      style={{
        animation: `shrink ${totalMs}ms linear ${-elapsed}ms forwards`,
        transformOrigin: "left",
      }}
    />
  );
}

/** True once the element is at least `minPx` wide: the switch between the field and the phone layout. */
export function useWide(ref: RefObject<HTMLElement | null>): boolean {
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWide(el.getBoundingClientRect().width >= WIDE_FROM_PX);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return wide;
}

/**
 * A ref for a marker placed at the end of a scrolling list: when it comes within reach of the viewport
 * `onNeed` fires, and fires again after each load (`version` changes) if the marker is still in reach,
 * so a short page keeps loading until it fills.
 */
export function useNearEnd(root: RefObject<HTMLElement | null>, enabled: boolean, version: number, onNeed: () => void) {
  const [marker, setMarker] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!marker || !enabled) return;
    const observer = new IntersectionObserver(([entry]) => entry?.isIntersecting && onNeed(), { root: root.current, rootMargin: "320px" });
    observer.observe(marker);
    return () => observer.disconnect();
  }, [marker, enabled, version, onNeed, root]);
  return setMarker;
}
