/**
 * Rolling-window date math for the example seeds. Pure: no database, no clock reads beyond the
 * `today` the caller passes in, so it is unit-testable and deterministic.
 *
 * Why this exists: every seed is idempotent by ROOT NAME ("does 'Bella Cucina' already exist?"),
 * which makes re-running one a no-op. Combined with open hours laid down as absolute spans from
 * the day of the first seed, that means a long-lived deployment goes dark the moment its seeded
 * horizon lapses, and no page view can heal it. Coverage, not existence, is the right question.
 */

/** Slots per day of week (0 = Sunday), each an offset from local midnight plus a duration. */
export type DaySchedule = Record<number, { h: number; m: number; dur: number }[]>;

/** How far ahead open hours are kept. Under deltat's 90-day MAX_QUERY_WINDOW, so a single
 *  availability query can see the whole window. */
export const HORIZON_DAYS = 60;

const MINUTES_PER_DAY = 1440;

/** Local midnight of the day containing `ms`. */
export function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Local midnight `n` calendar days after the day containing `ms`. Steps by date rather than by
 * 86_400_000 so a DST boundary inside the horizon shifts the wall clock instead of sliding every
 * later occurrence by an hour.
 */
export function addLocalDays(ms: number, n: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** How far a resource's OPEN hours currently reach; 0 when it has none. Blocking rules are
 *  irrelevant here: they subtract from a window, they never establish one. */
export function coveredThrough(rules: readonly { end: number; blocking: boolean }[]): number {
  return rules.reduce((max, r) => (r.blocking ? max : Math.max(max, r.end)), 0);
}

/**
 * The open-hours occurrences that are missing between `coveredThrough` and `today + horizonDays`.
 *
 * Three cases, all handled by the same two lines: nothing seeded yet (`coveredThrough` 0) lays the
 * whole window down; a live window emits only its tail; a lapsed window restarts at today and
 * never backfills the past, because availability behind now is noise.
 */
export function scheduleOccurrences(
  schedule: DaySchedule,
  opts: { today: number; coveredThrough: number; horizonDays: number; from?: number }
): { start: number; end: number }[] {
  // `from` lets a caller reach back before today on the FIRST seed only (the gym backfills the
  // current month so "spots left" varies across the visible calendar). Once coverage exists the
  // watermark dominates, so a top-up never revisits it.
  const earliest = opts.from ?? opts.today;
  const from = Math.max(startOfLocalDay(earliest), startOfLocalDay(opts.coveredThrough));
  const until = addLocalDays(opts.today, opts.horizonDays);

  const out: { start: number; end: number }[] = [];
  for (let day = from; day < until; day = addLocalDays(day, 1)) {
    for (const { h, m, dur } of schedule[new Date(day).getDay()] ?? []) {
      const openAt = h * 60 + m;
      const start = localTime(day, openAt);
      // The max end of the existing rules is the watermark: anything starting at or after it has
      // not been laid down yet, and anything before it has. No per-rule diffing needed.
      if (start < opts.coveredThrough) continue;
      out.push({ start, end: localTime(day, openAt + dur) });
    }
  }
  return out;
}

/**
 * The instant `minutesFromMidnight` wall-clock minutes into the local day containing `dayMs`,
 * rolling into later dates when it runs past midnight (a cinema open "08:00 for 17h" closes at
 * 01:00 tomorrow).
 *
 * Wall clock, not elapsed time, on both ends: open hours are what a sign on the door says. On the
 * night the clocks change that keeps 09:00 at 09:00, and it keeps consecutive all-day windows
 * exactly abutting, where an elapsed-time end would leave the hour-long hole that reads as
 * "closed" to any query crossing midnight.
 */
function localTime(dayMs: number, minutesFromMidnight: number): number {
  const d = new Date(dayMs);
  const days = Math.floor(minutesFromMidnight / MINUTES_PER_DAY);
  const rem = minutesFromMidnight - days * MINUTES_PER_DAY;
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + days,
    Math.floor(rem / 60),
    rem % 60,
    0,
    0
  ).getTime();
}
