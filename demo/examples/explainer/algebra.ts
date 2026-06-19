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
    title: "Open hours",
    caption:
      "Start with when each person works. Bob and Jane are both open from 9am to 5pm. That is the most they could ever be free.",
    layers: ["open"],
  },
  {
    title: "Take out closed time",
    caption:
      "Take away any blocked time, like a holiday or a lunch break. Neither has one today, so nothing changes yet.",
    layers: ["open", "blocking"],
  },
  {
    title: "Take out what is booked",
    caption:
      "Take away what is already on the calendar. Bob has a meeting from 9 to 10. Jane has back to back meetings from 9 to 12. Those exact slices are removed.",
    layers: ["open", "blocking", "booking"],
  },
  {
    title: "Take out live holds",
    caption:
      "Holds count too while their timer is alive, then come back when it runs out. Click the Both free lane to place one and watch both bands shrink.",
    layers: ["open", "blocking", "booking", "hold"],
  },
  {
    title: "What is left is free",
    caption:
      "Open hours, then take away closed time, bookings, and holds. What is left is each person's free time. Bob is free from 10 to 5, Jane from 12 to 5. That subtraction is the whole idea.",
    layers: ["open", "blocking", "booking", "hold", "net"],
  },
  {
    title: "When are both free?",
    caption:
      "Lay the two free bands on top of each other to find shared time. It starts at the later of the two, which is 12. One question answers this for both people at once.",
    layers: ["open", "blocking", "booking", "hold", "net", "combined"],
  },
];

export const STEP_COUNT = STEP_CAPTIONS.length;
