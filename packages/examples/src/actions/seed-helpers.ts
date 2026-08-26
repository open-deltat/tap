import { dt } from "../lib/deltat";
import * as store from "../lib/store";
import type { Resource, ResourceMeta } from "../lib/schemas";
import type { Rule } from "@open-deltat/client";
import {
  addLocalDays,
  coveredThrough,
  HORIZON_DAYS,
  scheduleOccurrences,
  startOfLocalDay,
  type DaySchedule,
} from "./schedule-window";

export { addLocalDays, coveredThrough, startOfLocalDay, type DaySchedule };

function toMeta(opts: { slotMinutes: number; price: number | null }): ResourceMeta {
  return { slotMinutes: opts.slotMinutes, price: opts.price };
}

export async function createVenue(
  name: string,
  opts: { slotMinutes: number; bufferMinutes: number },
  parentId?: string
): Promise<Resource> {
  const r = await dt.resources.create({
    parentId,
    name,
    bufferAfter: opts.bufferMinutes * 60_000 || undefined,
  });
  const m = toMeta({ slotMinutes: opts.slotMinutes, price: null });
  store.set(r.id, m);
  return { ...r, ...m, bufferMinutes: opts.bufferMinutes };
}

/** Idempotency within a visitor subtree: find a direct child of `parentId` by name. */
export async function findChildByName(parentId: string, name: string): Promise<string | null> {
  const children = await dt.resources.get({ parentId });
  return children.find((c) => c.name === name)?.id ?? null;
}

export async function createSection(
  parentId: string,
  name: string,
  opts: { slotMinutes: number; bufferMinutes: number; price: number }
): Promise<Resource> {
  const r = await dt.resources.create({
    parentId,
    name,
    bufferAfter: opts.bufferMinutes * 60_000 || undefined,
  });
  const m = toMeta({ slotMinutes: opts.slotMinutes, price: opts.price });
  store.set(r.id, m);
  return { ...r, ...m, bufferMinutes: opts.bufferMinutes };
}

export async function createSeats(
  parentId: string,
  rows: (string | number)[],
  cols: (string | number)[],
  opts: { slotMinutes: number; bufferMinutes: number; price: number }
): Promise<Resource[]> {
  const bufferAfter = opts.bufferMinutes * 60_000 || undefined;
  // One multi-row INSERT for the whole grid instead of a round-trip per seat.
  const items = rows.flatMap((row) =>
    cols.map((col) => ({ parentId, name: `${row}${col}`, bufferAfter }))
  );
  const created = await dt.resources.createMany(items);

  const m = toMeta({ slotMinutes: opts.slotMinutes, price: opts.price });
  return created.map((r) => {
    store.set(r.id, m);
    return { ...r, ...m, bufferMinutes: opts.bufferMinutes };
  });
}

export async function prebookSeats(
  seats: Resource[],
  count: number,
  start: number,
  durMinutes: number,
  label = "Sold"
): Promise<void> {
  const end = start + durMinutes * 60_000;
  for (const seat of seats.slice(0, count)) {
    await dt.bookings.create([{ resourceId: seat.id, start, end, label }]);
  }
}

/**
 * Extend `resourceId`'s open hours so they run from today to today + `horizonDays`, creating only
 * the occurrences that are missing.
 *
 * Safe to call on every page view, which is the point: a seed guarded only by "does this root
 * exist" freezes its open hours on the day it first ran, and the demo goes dark the moment that
 * window lapses. Asking about coverage instead makes the first seed and every later top-up the
 * same call.
 *
 * Returns the occurrences it created (empty when coverage was already sufficient), so a caller
 * that decorates its schedule (enrollments, sold seats) can decorate exactly the new days.
 */
export async function ensureSchedule(
  resourceId: string,
  schedule: DaySchedule,
  opts: { horizonDays?: number; from?: number } = {}
): Promise<{ start: number; end: number }[]> {
  const occurrences = scheduleOccurrences(schedule, {
    today: baseMs(),
    coveredThrough: coveredThrough(await dt.rules.get(resourceId)),
    horizonDays: opts.horizonDays ?? HORIZON_DAYS,
    from: opts.from,
  });
  if (occurrences.length === 0) return [];
  await dt.rules.create(
    occurrences.map((o) => ({ resourceId, start: o.start, end: o.end, blocking: false }))
  );
  return occurrences;
}

/**
 * Keep a single "always open" umbrella rule stretched to today + `horizonDays`. For venues whose
 * children carry the real schedule (a hotel's room types, a gym's courses) and whose own window
 * exists only to be a roof over them.
 *
 * Widens the existing rule rather than appending a second one, so a deployment that has been up
 * for a year still has exactly one umbrella instead of 365 abutting slivers.
 */
export async function ensureOpenWindow(
  resourceId: string,
  opts: { horizonDays?: number; from?: number } = {}
): Promise<{ start: number; end: number }> {
  const until = addLocalDays(baseMs(), opts.horizonDays ?? HORIZON_DAYS);
  const open = (await dt.rules.get(resourceId)).filter((r) => !r.blocking);
  const widest = open.reduce<Rule | null>((best, r) => (!best || r.end > best.end ? r : best), null);

  if (!widest) {
    const start = opts.from ?? baseMs();
    await dt.rules.create([{ resourceId, start, end: until, blocking: false }]);
    return { start, end: until };
  }
  if (widest.end < until) {
    await dt.rules.update(widest.id, { start: widest.start, end: until, blocking: false });
  }
  const start = open.reduce((lo, r) => Math.min(lo, r.start), widest.start);
  return { start, end: Math.max(widest.end, until) };
}

export function daily(shows: { h: number; m: number; dur: number }[]): DaySchedule {
  return Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, shows]));
}

export async function findRootByName(name: string): Promise<string | null> {
  const roots = await dt.resources.get({ roots: true });
  const found = roots.find((r) => r.name === name);
  return found?.id ?? null;
}

export function baseMs(): number {
  const now = new Date();
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  return base.getTime();
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

