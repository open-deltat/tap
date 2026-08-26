"use server";

import { dt } from "../../lib/deltat";
import { ensureSchedule, ensureOpenWindow, findRootByName } from "../../actions/seed-helpers";

const NAME = "FitFlow Studio";
const DAY = 86_400_000;
const ENROLL_WINDOW_DAYS = 35; // only fill upcoming classes, so "spots left" varies where it matters

export type GymCourse = { id: string; name: string; capacity: number };

type CourseDef = {
  name: string;
  capacity: number;
  schedule: Record<number, { h: number; m: number; dur: number }[]>;
};

// Each course is ONE capacity-N resource; the weekly slots become non-blocking rules (open class
// windows). Enrollments are bookings inside those windows, so the capacity sweep gives per-class
// spots-left for free.
const COURSES: CourseDef[] = [
  {
    name: "Vinyasa Yoga",
    capacity: 12,
    schedule: {
      2: [{ h: 18, m: 0, dur: 60 }],
      4: [{ h: 18, m: 0, dur: 60 }],
      6: [{ h: 9, m: 0, dur: 60 }],
    },
  },
  {
    name: "Spin",
    capacity: 20,
    schedule: {
      1: [{ h: 7, m: 0, dur: 45 }],
      3: [{ h: 7, m: 0, dur: 45 }],
      5: [{ h: 7, m: 0, dur: 45 }],
    },
  },
  {
    name: "HIIT",
    capacity: 16,
    schedule: {
      1: [{ h: 18, m: 30, dur: 45 }],
      3: [{ h: 18, m: 30, dur: 45 }],
    },
  },
  {
    name: "Boxing",
    capacity: 10,
    schedule: {
      2: [{ h: 19, m: 30, dur: 60 }],
      6: [{ h: 10, m: 30, dur: 60 }],
    },
  },
  {
    name: "Reformer Pilates",
    capacity: 8,
    schedule: {
      2: [{ h: 9, m: 30, dur: 50 }],
      4: [{ h: 9, m: 30, dur: 50 }],
    },
  },
];

function monthStartMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

// Deterministic per-class fill so the calendar reads as a real week (some full, some wide open,
// most partway) without storing randomness, and without Math.random, which the seed must avoid.
function fillFor(seed: string, capacity: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const r = (h >>> 0) % 100;
  if (r < 15) return capacity; // ~15% sold out
  if (r < 35) return 0; // ~20% wide open
  return Math.min(capacity, 1 + (r % capacity)); // the rest partway full
}

/**
 * Enroll members into `occurrences`, deterministically, so spots-left varies across the calendar.
 * Only ever handed the classes this run created, so a top-up fills the newly opened days and
 * leaves every existing class's roster alone.
 */
async function fillClasses(
  resourceId: string,
  def: CourseDef,
  occurrences: { start: number; end: number }[]
): Promise<void> {
  if (occurrences.length === 0) return;
  const enrollUntil = Date.now() + ENROLL_WINDOW_DAYS * DAY;

  // Two page views can open the same day at the same moment. Enrolling into a class that already
  // has its members would push it past capacity and fail the whole seed, taking the page with it,
  // so treat "already has members" as done.
  const enrolled = new Set((await dt.bookings.get(resourceId)).map((b) => b.start));

  for (const occ of occurrences) {
    if (occ.start > enrollUntil || enrolled.has(occ.start)) continue;
    const fill = fillFor(`${def.name}:${occ.start}`, def.capacity);
    if (fill === 0) continue;
    await dt.bookings.create(
      Array.from({ length: fill }, () => ({
        resourceId,
        start: occ.start,
        end: occ.end,
        label: "Member",
      }))
    );
  }
}

export type GymData = { rootId: string; courses: GymCourse[]; window: { start: number; end: number } };

export async function ensureGym(): Promise<GymData> {
  // Classes reach back to the 1st so the visible month reads as lived-in rather than starting
  // mid-page; the horizon still rolls forward from today.
  const from = monthStartMs();
  const existingId = await findRootByName(NAME);

  if (existingId) {
    const children = await dt.resources.get({ parentId: existingId });
    // Roof before rooms (SQLSTATE 23514), then top up each course and enroll into what opened.
    const window = await ensureOpenWindow(existingId, { from });
    for (const child of children) {
      const def = COURSES.find((c) => c.name === child.name);
      if (!def) continue;
      const opened = await ensureSchedule(child.id, def.schedule, { from });
      await fillClasses(child.id, def, opened);
    }
    return {
      rootId: existingId,
      courses: children.map((c) => ({ id: c.id, name: c.name ?? "Class", capacity: c.capacity })),
      window,
    };
  }

  const gym = await dt.resources.create({ name: NAME });
  // One long "always open" rule on the gym itself. deltat rejects a child's open-hours rule that
  // the parent's availability does not cover (SQLSTATE 23514), so this roof goes up first.
  const window = await ensureOpenWindow(gym.id, { from });

  const courses: GymCourse[] = [];
  for (const def of COURSES) {
    const r = await dt.resources.create({ parentId: gym.id, name: def.name, capacity: def.capacity });
    const opened = await ensureSchedule(r.id, def.schedule, { from });
    await fillClasses(r.id, def, opened);
    courses.push({ id: r.id, name: def.name, capacity: def.capacity });
  }

  return { rootId: gym.id, courses, window };
}
