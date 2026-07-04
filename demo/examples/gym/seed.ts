"use server";

import { dt } from "@open-deltat/examples/lib/deltat";
import { addSchedule, findRootByName } from "@open-deltat/examples/actions/seed-helpers";
import type { Rule } from "@open-deltat/client";

const NAME = "FitFlow Studio";
const DAY = 86_400_000;
const SCHEDULE_DAYS = 70; // current month + next, expanded into rules at the edge (EDGE-03)
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

// The seeded coverage window, read back from the gym's "always open" rule(s) so the UI can clamp
// navigation to months that actually have data.
function windowFromRootRules(rules: Rule[]): { start: number; end: number } {
  const open = rules.filter((r) => !r.blocking);
  if (open.length === 0) {
    const base = monthStartMs();
    return { start: base, end: base + (SCHEDULE_DAYS + 1) * DAY };
  }
  return {
    start: Math.min(...open.map((r) => r.start)),
    end: Math.max(...open.map((r) => r.end)),
  };
}

export type GymData = { rootId: string; courses: GymCourse[]; window: { start: number; end: number } };

export async function ensureGym(): Promise<GymData> {
  const existingId = await findRootByName(NAME);
  if (existingId) {
    const [children, rootRules] = await Promise.all([
      dt.resources.get({ parentId: existingId }),
      dt.rules.get(existingId),
    ]);
    return {
      rootId: existingId,
      courses: children.map((c) => ({ id: c.id, name: c.name ?? "Class", capacity: c.capacity })),
      window: windowFromRootRules(rootRules),
    };
  }

  const gym = await dt.resources.create({ name: NAME });
  const base = monthStartMs();
  const windowEnd = base + (SCHEDULE_DAYS + 1) * DAY;
  const enrollUntil = Date.now() + ENROLL_WINDOW_DAYS * DAY;

  // One long "always open" rule on the gym itself. deltat requires a child's open-hours rules to be
  // covered by the parent's availability, so each course's class windows inherit from this.
  await dt.rules.create([{ resourceId: gym.id, start: base, end: windowEnd, blocking: false }]);

  const courses: GymCourse[] = [];
  for (const def of COURSES) {
    const r = await dt.resources.create({ parentId: gym.id, name: def.name, capacity: def.capacity });
    const occurrences = await addSchedule(r.id, base, SCHEDULE_DAYS, def.schedule);

    // Fill upcoming classes (through the enroll window) so spots-left varies across the visible
    // month, including classes already past today, which otherwise read as uniformly wide-open.
    for (const occ of occurrences) {
      if (occ.start > enrollUntil) continue;
      const fill = fillFor(`${def.name}:${occ.start}`, def.capacity);
      if (fill === 0) continue;
      await dt.bookings.create(
        Array.from({ length: fill }, () => ({
          resourceId: r.id,
          start: occ.start,
          end: occ.end,
          label: "Member",
        }))
      );
    }

    courses.push({ id: r.id, name: def.name, capacity: def.capacity });
  }

  return { rootId: gym.id, courses, window: { start: base, end: windowEnd } };
}
