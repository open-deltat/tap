import type { DaySchedule } from "../../actions/schedule-window";

// The studio's shape: the seed builds it, and the hosted MCP's modelling guide describes it, from
// these same values.

export const NAME = "FitFlow Studio";

export type CourseDef = {
  name: string;
  capacity: number;
  schedule: DaySchedule;
};

/**
 * Each course is ONE capacity-N resource; the weekly slots become non-blocking rules (open class
 * windows). Enrollments are bookings inside those windows, so the capacity sweep gives per-class
 * spots-left for free.
 */
export const COURSES: CourseDef[] = [
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
