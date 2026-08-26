export interface RecurrencePattern {
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  fromDate: string;
  toDate: string;
  /** IANA zone the wall-clock times are interpreted in. Defaults to "UTC". */
  timeZone?: string;
  blocking?: boolean;
  excludeDates?: string[];
}

export type ExplicitSegment = { start: number; end: number; blocking?: boolean };

export interface RuleSegment {
  start: number;
  end: number;
  blocking: boolean;
}

const MINUTES_PER_DAY = 24 * 60;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = MINUTES_PER_DAY * MS_PER_MINUTE;

function isExplicitArray(
  input: RecurrencePattern | ExplicitSegment[]
): input is ExplicitSegment[] {
  return Array.isArray(input);
}

/** Parse "HH:MM" to minutes from midnight, throwing on anything malformed or out of range. */
function parseTimeOfDay(label: string, value: string, maxMinutes: number): number {
  const parts = value.split(":");
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  const total = hours * 60 + minutes;
  const wellFormed =
    parts.length === 2 &&
    parts[0] !== "" &&
    parts[1] !== "" &&
    Number.isInteger(hours) &&
    Number.isInteger(minutes) &&
    hours >= 0 &&
    minutes >= 0 &&
    minutes <= 59;
  if (!wellFormed || total > maxMinutes) {
    const max = `${String(Math.floor(maxMinutes / 60)).padStart(2, "0")}:${String(maxMinutes % 60).padStart(2, "0")}`;
    throw new Error(`Invalid ${label} "${value}": expected "HH:MM" between 00:00 and ${max}`);
  }
  return total;
}

/** Parse "YYYY-MM-DD" to the Unix ms of that date's UTC midnight, throwing on impossible dates. */
function parseCalendarDate(label: string, value: string): number {
  const parts = value.split("-").map(Number);
  const [year, month, day] = parts;
  const ms = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(ms);
  const valid =
    parts.length === 3 &&
    parts.every(Number.isInteger) &&
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day;
  if (!valid) {
    throw new Error(`Invalid ${label} "${value}": expected a real "YYYY-MM-DD" date`);
  }
  return ms;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/** UTC offset of `timeZone` at the instant `utcMs`, in ms (positive east of UTC). */
function zoneOffsetMs(timeZone: string, utcMs: number): number {
  const fields: Record<string, number> = {};
  for (const part of zoneFormatter(timeZone).formatToParts(new Date(utcMs))) {
    if (part.type !== "literal") fields[part.type] = Number(part.value);
  }
  return Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute) - utcMs;
}

/**
 * Convert a wall-clock time in `timeZone` (given as its Unix ms reading if it were UTC) to the
 * actual Unix ms. An ambiguous fall-back time resolves to the earlier instant; a nonexistent
 * spring-forward time shifts forward by the gap (Temporal's "compatible" disambiguation).
 */
function wallTimeToUnixMs(timeZone: string, wallAsUtcMs: number): number {
  // Transitions near the wall time sit within +-24h of its UTC reading, so sampling the offset a
  // day on each side captures both sides of any transition; the fixed-point filter below discards
  // offsets that do not actually produce this wall time.
  const offsets = [
    ...new Set([
      zoneOffsetMs(timeZone, wallAsUtcMs - MS_PER_DAY),
      zoneOffsetMs(timeZone, wallAsUtcMs),
      zoneOffsetMs(timeZone, wallAsUtcMs + MS_PER_DAY),
    ]),
  ];
  const instants = offsets
    .map((offset) => wallAsUtcMs - offset)
    .filter((instant) => wallAsUtcMs - zoneOffsetMs(timeZone, instant) === instant);
  if (instants.length > 0) return Math.min(...instants);
  // No offset reproduces the wall time: it falls in a spring-forward gap. Applying the smaller
  // (pre-transition) offset shifts it forward by the gap.
  return wallAsUtcMs - Math.min(...offsets);
}

/**
 * Expand a recurring pattern into concrete `[start, end)` rule segments in Unix ms. The kernel
 * stores only flat segments, so recurrence is materialized here at the edge rather than in deltat.
 * An array of explicit segments passes through unchanged, with `blocking` defaulted to false.
 *
 * Wall-clock times are interpreted in the pattern's IANA `timeZone` (default `"UTC"`), never the
 * process's local timezone, so a pattern expands to the same absolute segments on every machine.
 * Across DST transitions the wall time is preserved: a nonexistent spring-forward time shifts
 * forward by the gap, and an ambiguous fall-back time resolves to the earlier instant. A window
 * inverted by a gap (its shifted start passing its end) yields no segment for that day.
 *
 * `endTime` may be `"24:00"` for an until-midnight window, and an `endTime` at or before
 * `startTime`'s wall time rolls into the next day (an overnight window such as 22:00 to 02:00).
 * `excludeDates` name the calendar day a window starts on. Throws on malformed times or dates,
 * on `endTime` equal to `startTime`, and on an unknown `timeZone`.
 */
export function expandRecurrence(
  input: RecurrencePattern | ExplicitSegment[]
): RuleSegment[] {
  if (isExplicitArray(input)) {
    return input.map((s) => ({
      start: s.start,
      end: s.end,
      blocking: s.blocking ?? false,
    }));
  }

  const {
    daysOfWeek,
    startTime,
    endTime,
    fromDate,
    toDate,
    timeZone = "UTC",
    blocking = false,
    excludeDates,
  } = input;
  const excludeSet = new Set(excludeDates);

  const startMinutes = parseTimeOfDay("startTime", startTime, MINUTES_PER_DAY - 1);
  const endMinutes = parseTimeOfDay("endTime", endTime, MINUTES_PER_DAY);
  if (endMinutes === startMinutes) {
    throw new Error(`endTime "${endTime}" equals startTime "${startTime}": the window is empty`);
  }
  const effectiveEndMinutes =
    endMinutes < startMinutes ? endMinutes + MINUTES_PER_DAY : endMinutes;

  const fromMs = parseCalendarDate("fromDate", fromDate);
  const toMs = parseCalendarDate("toDate", toDate);

  const segments: RuleSegment[] = [];
  for (let dayMs = fromMs; dayMs <= toMs; dayMs += MS_PER_DAY) {
    const day = new Date(dayMs);
    if (!daysOfWeek.includes(day.getUTCDay())) continue;

    const dateStr = `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}-${String(day.getUTCDate()).padStart(2, "0")}`;
    if (excludeSet.has(dateStr)) continue;

    const start = wallTimeToUnixMs(timeZone, dayMs + startMinutes * MS_PER_MINUTE);
    const end = wallTimeToUnixMs(timeZone, dayMs + effectiveEndMinutes * MS_PER_MINUTE);
    if (end > start) {
      segments.push({ start, end, blocking });
    }
  }

  return segments;
}
