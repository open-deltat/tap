// Pure helpers for the availability field: free time as segments on a day-by-hour plane. Everything
// is local calendar days over raw Unix ms, the same number line deltat uses.

export interface Slot {
  start: number;
  end: number;
}

/** A slot someone is holding: out of circulation until `expiresAt` unless they book it. */
export interface HeldSlot extends Slot {
  expiresAt: number;
}

/** Everything the field draws, from one read of one resource over a window. */
export interface FieldSnapshot {
  /** Open ranges, as deltat returns them. */
  free: Slot[];
  /** Holds placed by anyone, with the server's own expiry. */
  holds: HeldSlot[];
  /** Bookings. Only the caller's own carry an id, so nobody can cancel what is not theirs. */
  busy: BusySlot[];
  /** The server's clock when this was read, so the page can count down in the server's time. */
  at: number;
  /** How long a booking lives in this demo, for its timer bar. */
  bookingTtlMs: number;
}

/** A slot that is booked. `mine` is the visitor's own, which they may cancel until `expiresAt`. */
export interface BusySlot extends Slot {
  mine: boolean;
  /** Only present on the visitor's own bookings; other people's ids never reach the page. */
  id?: string;
  expiresAt?: number;
}

export interface DayRow {
  /** Local midnight, in ms. */
  dayStart: number;
  /** Open to book. */
  slots: Slot[];
  /** Held by someone else right now. */
  held: HeldSlot[];
  /** Already booked. */
  busy: BusySlot[];
}

/** The hours the time axis spans, e.g. 9 to 17. */
export interface Axis {
  fromHour: number;
  toHour: number;
}

export const HOUR_MS = 3_600_000;
const DEFAULT_AXIS: Axis = { fromHour: 9, toHour: 17 };

export const midnightOf = (ms: number): number => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** Open stretches become fixed-length appointments; a stretch shorter than one slot yields none. */
export function sliceSlots(open: readonly Slot[], slotMs: number): Slot[] {
  return open.flatMap((range) =>
    Array.from({ length: Math.max(0, Math.floor((range.end - range.start) / slotMs)) }, (_, i) => ({
      start: range.start + i * slotMs,
      end: range.start + (i + 1) * slotMs,
    }))
  );
}

/** Local midnights for `count` consecutive days. Calendar arithmetic, so a DST day is not 24h off. */
export function dayStarts(from: Date, count: number): number[] {
  return Array.from({ length: count }, (_, i) => new Date(from.getFullYear(), from.getMonth(), from.getDate() + i).getTime());
}

/** One row per day, empty days included, so a closed day is visible as a gap instead of missing. */
export function groupByDay(
  slots: readonly Slot[],
  starts: readonly number[],
  held: readonly HeldSlot[] = [],
  busy: readonly BusySlot[] = []
): DayRow[] {
  const rows: DayRow[] = starts.map((dayStart) => ({ dayStart, slots: [], held: [], busy: [] }));
  const indexOf = new Map(starts.map((dayStart, i) => [dayStart, i]));
  const rowOf = (slot: Slot) => rows[indexOf.get(midnightOf(slot.start)) ?? -1];
  for (const slot of slots) rowOf(slot)?.slots.push(slot);
  for (const slot of held) rowOf(slot)?.held.push(slot);
  for (const slot of busy) rowOf(slot)?.busy.push(slot);
  return rows;
}

export type Block = { kind: "open"; row: DayRow } | { kind: "closed"; rows: readonly DayRow[] };

// A day with only booked or held time is still a day with time: full is not the same as closed.
const hasTime = (row: DayRow) => row.slots.length > 0 || row.held.length > 0 || row.busy.length > 0;

/** A number that changes when the calendar month does. */
export const monthOf = (ms: number): number => {
  const d = new Date(ms);
  return d.getFullYear() * 12 + d.getMonth();
};

/**
 * Consecutive days with nothing to show fold into one block, so a weekend is one thin line, not two rows.
 * A fold never crosses a month: a weekend that straddles the 1st is two lines, so the first of the month
 * always starts a block and a month divider can sit exactly where the month turns.
 */
export function toBlocks(rows: readonly DayRow[]): Block[] {
  return rows.reduce<Block[]>((blocks, row) => {
    if (hasTime(row)) return [...blocks, { kind: "open", row }];
    const last = blocks[blocks.length - 1];
    const sameMonth = last?.kind === "closed" && monthOf(last.rows[last.rows.length - 1].dayStart) === monthOf(row.dayStart);
    return last?.kind === "closed" && sameMonth ? [...blocks.slice(0, -1), { kind: "closed", rows: [...last.rows, row] }] : [...blocks, { kind: "closed", rows: [row] }];
  }, []);
}

/** The first day a block shows. */
export const firstDayOf = (block: Block): number => (block.kind === "open" ? block.row.dayStart : block.rows[0].dayStart);
/** The last day a block shows. */
export const lastDayOf = (block: Block): number => (block.kind === "open" ? block.row.dayStart : block.rows[block.rows.length - 1].dayStart);

/** The span of hours that covers every slot, rounded out to whole hours. */
export function axisOf(slots: readonly Slot[]): Axis {
  if (slots.length === 0) return DEFAULT_AXIS;
  const hourOf = (ms: number, midnight: number) => (ms - midnight) / HOUR_MS;
  const fromHour = Math.floor(Math.min(...slots.map((s) => hourOf(s.start, midnightOf(s.start)))));
  const toHour = Math.ceil(Math.max(...slots.map((s) => hourOf(s.end, midnightOf(s.start)))));
  return toHour > fromHour ? { fromHour, toHour } : DEFAULT_AXIS;
}

/** The axis only ever widens: scrolling to a day with longer hours must not shrink what is already on screen. */
export function widenAxis(current: Axis | null, next: Axis): Axis {
  return current ? { fromHour: Math.min(current.fromHour, next.fromHour), toHour: Math.max(current.toHour, next.toHour) } : next;
}

/** Slots from two lists as one, ordered, with a slot present in both counted once. */
export function mergeSlots(a: readonly Slot[], b: readonly Slot[]): Slot[] {
  const byStart = new Map([...a, ...b].map((s) => [s.start, s]));
  return [...byStart.values()].sort((x, y) => x.start - y.start);
}

export type NavKey ="ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";

/**
 * Where an arrow key moves the selection. Left and right walk the open times in order, across days;
 * up and down keep the time of day and land on the nearest open time in the previous or next open day.
 */
export function neighbour(rows: readonly DayRow[], from: Slot, key: NavKey): Slot | null {
  const rowIndex = rows.findIndex((r) => r.slots.some((s) => s.start === from.start));
  if (rowIndex < 0) return null;
  const row = rows[rowIndex];
  const flat = rows.flatMap((r) => r.slots);
  const at = flat.findIndex((s) => s.start === from.start);

  if (key === "ArrowLeft") return flat[at - 1] ?? null;
  if (key === "ArrowRight") return flat[at + 1] ?? null;
  if (key === "Home") return row.slots[0] ?? null;
  if (key === "End") return row.slots[row.slots.length - 1] ?? null;

  const step = key === "ArrowUp" ? -1 : 1;
  const target = rows.slice(step < 0 ? 0 : rowIndex + 1, step < 0 ? rowIndex : undefined);
  const candidates = step < 0 ? [...target].reverse() : target;
  const next = candidates.find((r) => r.slots.length > 0);
  if (!next) return null;
  const timeOfDay = from.start - row.dayStart;
  return next.slots.reduce((best, s) =>
    Math.abs(s.start - next.dayStart - timeOfDay) < Math.abs(best.start - next.dayStart - timeOfDay) ? s : best
  );
}

const isFree = (slots: readonly Slot[]) => new Set(slots.map((s) => s.start));

/**
 * Grow or shrink a chosen interval by one slot at its end. Growing needs the next slot to be open and
 * the result to stay under `maxMs` (a hold takes time out of circulation, so it stays short); shrinking
 * stops at one slot. Anything that cannot happen returns the interval unchanged.
 */
export function stepSpan(slots: readonly Slot[], span: Slot, step: 1 | -1, slotMs: number, maxMs: number): Slot {
  if (step === -1) return span.end - span.start > slotMs ? { start: span.start, end: span.end - slotMs } : span;
  const free = isFree(slots);
  const fits = free.has(span.end) && span.end + slotMs - span.start <= maxMs;
  return fits ? { start: span.start, end: span.end + slotMs } : span;
}

/**
 * The interval a drag covers, from the slot it started on to the slot under the pointer. It never
 * crosses a slot that is not open and never grows past `maxMs`, so dragging over a booking simply stops
 * at it. Works both ways: dragging left keeps the anchor at the right-hand end.
 */
export function dragSpan(slots: readonly Slot[], anchor: Slot, head: Slot, slotMs: number, maxMs: number): Slot {
  const free = isFree(slots);
  const dir = head.start >= anchor.start ? 1 : -1;
  const wanted = Math.round(Math.abs(head.start - anchor.start) / slotMs);
  const blockedAt = Array.from({ length: wanted }, (_, i) => i + 1).findIndex(
    (n) => !free.has(anchor.start + dir * n * slotMs) || (n + 1) * slotMs > maxMs
  );
  const reach = blockedAt === -1 ? wanted : blockedAt;
  return dir === 1 ? { start: anchor.start, end: anchor.end + reach * slotMs } : { start: anchor.start - reach * slotMs, end: anchor.end };
}

export type DayCell =
  | { kind: "free"; start: number; end: number }
  | { kind: "held"; start: number; end: number; source: HeldSlot }
  | { kind: "busy"; start: number; end: number; source: BusySlot };

/** Every slot of a day's grid that has something in it, in time order: for the narrow list, which has no ruler. */
export function cellsOfDay(row: DayRow, slotMs: number): DayCell[] {
  const cover = (span: Slot): Slot[] => {
    const first = row.dayStart + Math.floor((span.start - row.dayStart) / slotMs) * slotMs;
    const last = row.dayStart + Math.ceil((span.end - row.dayStart) / slotMs) * slotMs;
    return Array.from({ length: Math.max(0, Math.round((last - first) / slotMs)) }, (_, i) => ({ start: first + i * slotMs, end: first + (i + 1) * slotMs }));
  };
  const cells: DayCell[] = [
    ...row.slots.map((s): DayCell => ({ kind: "free", start: s.start, end: s.end })),
    ...row.held.flatMap((h) => cover(h).map((s): DayCell => ({ kind: "held", start: s.start, end: s.end, source: h }))),
    ...row.busy.flatMap((b) => cover(b).map((s): DayCell => ({ kind: "busy", start: s.start, end: s.end, source: b }))),
  ];
  return cells.sort((a, b) => a.start - b.start);
}

/**
 * The nearest places the same length of time is still open, after a lost race. Each candidate is a run
 * of free slots as long as the one that was refused; the closest to it win, and no two overlap.
 */
export function nearestFits(slots: readonly Slot[], around: Slot, slotMs: number, count: number): Slot[] {
  const free = isFree(slots);
  const length = Math.max(1, Math.round((around.end - around.start) / slotMs));
  const fits = (start: number) => Array.from({ length }, (_, i) => start + i * slotMs).every((s) => free.has(s));
  const candidates = slots
    .filter((s) => s.start !== around.start && fits(s.start))
    .map((s): Slot => ({ start: s.start, end: s.start + length * slotMs }))
    .sort((a, b) => Math.abs(a.start - around.start) - Math.abs(b.start - around.start));
  return candidates.reduce<Slot[]>(
    (picked, c) => (picked.length < count && picked.every((p) => c.start >= p.end || c.end <= p.start) ? [...picked, c] : picked),
    []
  );
}

export interface FieldChange {
  /** Slots someone else just booked, to flash. */
  taken: Slot[];
  /** One line for the feed, or null when nothing someone else did changed what is open. */
  message: string | null;
}

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const spanContains = (spans: readonly Slot[], s: Slot) => spans.some((sp) => s.start >= sp.start && s.start < sp.end);

/**
 * What another person did between two reads: slots that were open and are now booked or held, and slots
 * that opened up again. Your own holds and bookings are left out, so the feed reports the world, not you.
 * A slot someone booked wins over one they held, and either wins over one that came free.
 */
export function diffField(prev: FieldSnapshot, next: FieldSnapshot, slotMs: number, now: number, own: readonly Slot[] = [], until = Infinity): FieldChange {
  // `until` is the end of the window both reads cover: days that only the later read looked at are new, not changed.
  // `own` is every interval the visitor chose lately, held or released: what they did is not news to them.
  const upcoming = (snap: FieldSnapshot) =>
    sliceSlots(snap.free, slotMs).filter((s) => s.end > now && s.start < until && !spanContains(own, s));
  const before = upcoming(prev);
  const after = upcoming(next);
  const stillOpen = new Set(after.map((s) => s.start));
  const wasOpen = new Set(before.map((s) => s.start));
  const mineNow = next.busy.filter((b) => b.mine);
  const mineBefore = prev.busy.filter((b) => b.mine);

  const gone = before.filter((s) => !stillOpen.has(s.start));
  const taken = gone.filter((s) => spanContains(next.busy, s) && !spanContains(mineNow, s));
  const held = gone.filter((s) => spanContains(next.holds, s) && !spanContains(next.busy, s));
  const freed = after.filter((s) => !wasOpen.has(s.start) && !spanContains(mineBefore, s));

  const say = (slots: readonly Slot[], verb: string) => {
    const first = slots[0];
    return `${WEEKDAY.format(first.start)} ${clock(first.start)} ${verb}${slots.length > 1 ? ` and ${slots.length - 1} more` : ""}`;
  };
  const message = taken.length ? say(taken, "taken") : held.length ? say(held, "held") : freed.length ? say(freed, "free again") : null;
  return { taken, message };
}

/** "30 min", "1 h", "1 h 30 min". */
export function durationLabel(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  const [h, m] = [Math.floor(minutes / 60), minutes % 60];
  return [h > 0 ? `${h} h` : null, m > 0 ? `${m} min` : null].filter(Boolean).join(" ") || "0 min";
}

/** Whole seconds as m:ss, for a hold's countdown. Never negative. */
export function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const CLOCK = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
/** "10:30", without the AM/PM, for a label that sits inside a cell the ruler already explains. */
export const clock = (ms: number): string =>
  CLOCK.formatToParts(ms)
    .filter((p) => p.type !== "dayPeriod")
    .map((p) => p.value)
    .join("")
    .trim();

const HOUR = new Intl.DateTimeFormat(undefined, { hour: "numeric" });
export const hourLabel = (hour: number): string => HOUR.format(new Date(2000, 0, 1, hour));
