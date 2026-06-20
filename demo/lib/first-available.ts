import { getAvailability, getCombinedAvailability } from "@/app/actions/availability";
import { toLocalDateString } from "@/lib/time";

const DAY_MS = 86_400_000;

export interface NextOpening {
  /** Local date string (YYYY-MM-DD) of the next opening. */
  date: string;
  /** Start of the first open window on that day (the time the button shows). */
  start: number;
  end: number;
}

// deltat rejects very wide availability scans; keep the horizon under that ceiling.
const MAX_HORIZON_DAYS = 90;

/**
 * The soonest opening at/after `from`, looking forward over a horizon. Because deltat's availability
 * query is already forward-looking, "the next available day" is just the day of the first returned
 * slot — one query, no day-by-day probing. Naturally handles weekends/days off (no rules that day)
 * and fully-booked days (today's slots are subtracted away, so the first free slot is later).
 *
 * Returns null when nothing is open within the horizon, so callers can show a graceful empty state.
 */
export async function findNextAvailable(
  resourceIds: string[],
  from: Date,
  opts: { horizonDays?: number; minAvailable?: number; minDurationMs?: number } = {}
): Promise<NextOpening | null> {
  if (resourceIds.length === 0) return null;

  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  const horizon = Math.min(opts.horizonDays ?? 60, MAX_HORIZON_DAYS);
  const endMs = startMs + horizon * DAY_MS;
  const fromDate = toLocalDateString(start);

  const slots =
    resourceIds.length === 1
      ? await getAvailability(resourceIds[0], startMs, endMs)
      : await getCombinedAvailability(resourceIds, startMs, endMs, opts.minAvailable ?? resourceIds.length);

  const minMs = opts.minDurationMs ?? 0;
  // "Next" means a different day: never point back at the day the caller is already viewing.
  const usable = slots
    .filter((s) => s.end - s.start >= minMs && toLocalDateString(new Date(s.start)) !== fromDate)
    .sort((a, b) => a.start - b.start);
  if (usable.length === 0) return null;

  const s = usable[0];
  return { date: toLocalDateString(new Date(s.start)), start: s.start, end: s.end };
}
