export interface RecurrencePattern {
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  fromDate: string;
  toDate: string;
  blocking?: boolean;
  excludeDates?: string[];
}

export type ExplicitSegment = { start: number; end: number; blocking?: boolean };

export interface RuleSegment {
  start: number;
  end: number;
  blocking: boolean;
}

function isExplicitArray(
  input: RecurrencePattern | ExplicitSegment[]
): input is ExplicitSegment[] {
  return Array.isArray(input);
}

/**
 * Expand a recurring pattern into concrete `[start, end)` rule segments in Unix ms. The kernel
 * stores only flat segments, so recurrence is materialized here at the edge rather than in deltat.
 * An array of explicit segments passes through unchanged, with `blocking` defaulted to false.
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

  const { daysOfWeek, startTime, endTime, fromDate, toDate, blocking = false, excludeDates } = input;
  const excludeSet = new Set(excludeDates);

  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);

  const segments: RuleSegment[] = [];
  const cursor = new Date(fromDate + "T00:00:00");
  const end = new Date(toDate + "T23:59:59");

  while (cursor <= end) {
    if (daysOfWeek.includes(cursor.getDay())) {
      const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
      if (!excludeSet.has(dateStr)) {
        const dayStart = new Date(cursor);
        dayStart.setHours(startH, startM, 0, 0);
        const dayEnd = new Date(cursor);
        dayEnd.setHours(endH, endM, 0, 0);

        if (dayEnd.getTime() > dayStart.getTime()) {
          segments.push({
            start: dayStart.getTime(),
            end: dayEnd.getTime(),
            blocking,
          });
        }
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return segments;
}
