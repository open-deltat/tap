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
      "Start with when each person works — their open band. Bob and Jane are both open 09:00–17:00. That's the most they could ever be free. (rules → open band)",
    layers: ["open"],
  },
  {
    title: "Cut out closures",
    caption:
      "Remove any blocked-off time — holidays, lunch blocks, closures. Neither has one today, so the band is unchanged. (subtract blocking rules)",
    layers: ["open", "blocking"],
  },
  {
    title: "Cut out what's booked",
    caption:
      "Now remove what's already on the calendar. Bob has a 09:00–10:00 meeting; Jane has back-to-back meetings 09:00–12:00. Those exact spans are punched out of the band.",
    layers: ["open", "blocking", "booking"],
  },
  {
    title: "Cut out live holds",
    caption:
      "Pending holds (someone mid-booking) subtract too, while their timer is alive — then reappear when it expires. Click the Both-free lane to place one and watch both bands shrink in real time.",
    layers: ["open", "blocking", "booking", "hold"],
  },
  {
    title: "What's left = availability",
    caption:
      "Open hours minus closures minus bookings minus holds = each person's real free time: Bob 10:00–17:00, Jane 12:00–17:00. That subtraction is the whole availability query.",
    layers: ["open", "blocking", "booking", "hold", "net"],
  },
  {
    title: "When are BOTH free?",
    caption:
      "Overlap the two free bands to find shared time — it starts at the later of the two starts, 12:00. One query does this across both people at once. (getCombined, min_available = 2)",
    layers: ["open", "blocking", "booking", "hold", "net", "combined"],
  },
];

export const STEP_COUNT = STEP_CAPTIONS.length;
