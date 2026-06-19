import type { AvailabilitySlot } from "@/lib/schemas";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
export const AXIS_START_HOUR = 8; // 1h before open
export const AXIS_END_HOUR = 18; // 1h after close

export interface Span {
  start: number;
  end: number;
}

/** Position (0–100) of a timestamp on the shared ruler. */
export const pctOf = (ms: number, axisStart: number, axisEnd: number) =>
  ((ms - axisStart) / (axisEnd - axisStart)) * 100;

export const clampPct = (v: number) => Math.max(0, Math.min(100, v));

/** Port of the engine's merge_overlapping: sort, then coalesce touching/overlapping spans. */
export function mergeOverlapping(spans: Span[]): Span[] {
  if (spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const out: Span[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/** Port of the engine's subtract_intervals: base − remove, half-open [start, end). */
export function subtractIntervals(base: Span[], remove: Span[]): Span[] {
  const cuts = mergeOverlapping(remove.filter((r) => r.end > r.start));
  let result = mergeOverlapping(base.filter((b) => b.end > b.start));
  for (const cut of cuts) {
    const next: Span[] = [];
    for (const span of result) {
      if (cut.end <= span.start || cut.start >= span.end) {
        next.push(span); // no overlap
        continue;
      }
      if (cut.start > span.start) next.push({ start: span.start, end: cut.start });
      if (cut.end < span.end) next.push({ start: cut.end, end: span.end });
    }
    result = next;
  }
  return result;
}

/** Extend each allocation's end by the buffer (the visual punch-out includes turnaround). */
export function extendByBuffer(allocs: Span[], bufferMs: number): Span[] {
  if (bufferMs <= 0) return allocs.map((a) => ({ ...a }));
  return allocs.map((a) => ({ start: a.start, end: a.end + bufferMs }));
}

/** Clamp a span list to the visible day window [start, end). */
export function clampSpans(spans: Span[], start: number, end: number): Span[] {
  return spans
    .map((s) => ({ start: Math.max(s.start, start), end: Math.min(s.end, end) }))
    .filter((s) => s.end > s.start);
}

export const totalHours = (spans: { start: number; end: number }[]): number =>
  spans.reduce((sum, s) => sum + (s.end - s.start), 0) / HOUR_MS;

export type StepKind = "open" | "blocking" | "booking" | "hold" | "net" | "combined";

export interface StepCaption {
  title: string;
  /** The deltat operation this step performs, in engine terms. */
  caption: string;
  /** Which sub-layers are visible at this step (cumulative). */
  layers: StepKind[];
}

/** Six steps, 0-indexed — each reveals one more layer across BOTH calendars at once. */
export const STEP_CAPTIONS: StepCaption[] = [
  {
    title: "Open windows",
    caption:
      "availability() step 1 — non-blocking rules define the open band. Bob and Jane are both open 09:00–17:00.",
    layers: ["open"],
  },
  {
    title: "Subtract blocking rules",
    caption:
      "subtract_intervals(open, blocking) — own + inherited, ACCUMULATE. None here, so nothing changes.",
    layers: ["open", "blocking"],
  },
  {
    title: "Subtract bookings",
    caption:
      "subtract_intervals(free, bookings) — Bob loses 09:00–10:00; Jane loses 09:00–12:00 (three appointments).",
    layers: ["open", "blocking", "booking"],
  },
  {
    title: "Subtract holds",
    caption:
      "Live holds where expires_at > now subtract too — click the Both-free lane to place one and watch both shrink.",
    layers: ["open", "blocking", "booking", "hold"],
  },
  {
    title: "Net availability",
    caption:
      "The engine returns Bob [10:00, 17:00), Jane [12:00, 17:00) — dt.availability.get per resource.",
    layers: ["open", "blocking", "booking", "hold", "net"],
  },
  {
    title: "Intersection (both free)",
    caption:
      "dt.availability.getCombined(…, min_available = 2) — overlap starts at max(10:00, 12:00) = 12:00.",
    layers: ["open", "blocking", "booking", "hold", "net", "combined"],
  },
];

export const STEP_COUNT = STEP_CAPTIONS.length;
