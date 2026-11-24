import { expandRecurrence } from "@open-deltat/client";

// The meeting planner's arithmetic. Each person's working hours are wall-clock times in their own
// zone; the SDK's expandRecurrence turns them into absolute spans the same way Δt's own calendars do
// (DST-safe, IANA zones), and the overlap is the plain intersection of those spans. Pure: the date
// and zones come in, nothing reads the clock.

export interface Span {
  readonly start: number;
  readonly end: number;
}

export interface Person {
  readonly zone: string;
  /** "HH:MM" in the person's zone. An end before the start runs overnight. */
  readonly from: string;
  readonly to: string;
}

export interface DayPlan {
  /** The planning day in the organiser's zone: 23, 24 or 25 hours long. */
  readonly day: Span;
  /** Each person's working time inside that day, in input order. */
  readonly working: readonly (readonly Span[])[];
  /** When everyone is working at once. */
  readonly overlap: readonly Span[];
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** A calendar date `n` days from `date` (YYYY-MM-DD). Pure calendar arithmetic, no zone involved. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Intersection of two sorted lists of half-open spans. */
export function intersect(a: readonly Span[], b: readonly Span[]): Span[] {
  return a.flatMap((x) => b.flatMap((y) => (Math.max(x.start, y.start) < Math.min(x.end, y.end) ? [{ start: Math.max(x.start, y.start), end: Math.min(x.end, y.end) }] : [])));
}

/** Overlapping or touching spans joined, so 09:00-12:00 and 12:00-17:00 read as one stretch. */
export function merge(spans: readonly Span[]): Span[] {
  return [...spans]
    .sort((x, y) => x.start - y.start)
    .reduce<Span[]>((out, s) => {
      const last = out.at(-1);
      return last && s.start <= last.end ? [...out.slice(0, -1), { start: last.start, end: Math.max(last.end, s.end) }] : [...out, s];
    }, []);
}

export function planDay(date: string, organiserZone: string, people: readonly Person[]): DayPlan {
  const [day] = expandRecurrence({ daysOfWeek: ALL_DAYS, startTime: "00:00", endTime: "24:00", fromDate: date, toDate: date, timeZone: organiserZone });
  // A person's working day can start the day before or after the organiser's date, so expand one day
  // either side and keep what falls inside the organiser's day.
  const working = people.map((p) =>
    intersect(
      merge(expandRecurrence({ daysOfWeek: ALL_DAYS, startTime: p.from, endTime: p.to, fromDate: addDays(date, -1), toDate: addDays(date, 1), timeZone: p.zone })),
      [day]
    )
  );
  const overlap = working.length === 0 ? [] : working.reduce<Span[]>((acc, w) => intersect(acc, w), [day]);
  return { day, working, overlap };
}
