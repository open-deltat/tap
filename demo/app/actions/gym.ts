"use server";

import { dt } from "@/lib/deltat";
import * as store from "@/lib/store";
import { ensureGym } from "@/examples/gym/seed";

// What anyone embedding the public schedule may see: the class, when it runs, and how many spots
// are left — a free COUNT, never the capacity denominator or the roster.
export interface PublicClass {
  id: string;
  title: string;
  start: number;
  end: number;
  spotsLeft: number;
  full: boolean;
}

// The staff view adds the internal fields. instructor + notes come from the sidecar; capacity and
// the booked count come from deltat. None of these are ever sent down the public path.
export interface StaffClass extends PublicClass {
  instructor: string | null;
  notes: string | null;
  capacity: number;
  booked: number;
}

async function buildStaffSchedule(start: number, end: number): Promise<StaffClass[]> {
  const { courses } = await ensureGym();
  const out: StaffClass[] = [];

  for (const course of courses) {
    const [rules, bookings] = await Promise.all([
      dt.rules.get(course.id),
      dt.bookings.get(course.id, { start, end }),
    ]);
    const meta = store.get(course.id);

    for (const rule of rules) {
      if (rule.blocking) continue;
      if (rule.end <= start || rule.start >= end) continue; // not in window

      const booked = bookings.filter((b) => b.start < rule.end && b.end > rule.start).length;
      const spotsLeft = Math.max(0, course.capacity - booked);

      out.push({
        id: rule.id,
        title: course.name,
        start: rule.start,
        end: rule.end,
        spotsLeft,
        full: spotsLeft === 0,
        instructor: meta?.instructor ?? null,
        notes: meta?.notes ?? null,
        capacity: course.capacity,
        booked,
      });
    }
  }

  out.sort((a, b) => a.start - b.start);
  return out;
}

// Intentionally unauthenticated for the demo: the Public/Staff toggle on /demos/gym calls this to
// show what an internal view exposes. In a real deployment this MUST sit behind auth — hiding the
// UI toggle is not enough, since the action can be POSTed directly. The embed widget never reaches
// it (it is pinned to the public view), so the published schedule stays redacted.
export async function getStaffSchedule(start: number, end: number): Promise<StaffClass[]> {
  return buildStaffSchedule(start, end);
}

export async function getPublicSchedule(start: number, end: number): Promise<PublicClass[]> {
  const staff = await buildStaffSchedule(start, end);
  // Redaction happens HERE, server-side: instructor, notes, capacity and the booked count are
  // dropped before the response is serialized, so the public path can never leak them. deltat does
  // no field-level auth — every read sees every column — so the trusted edge is the only safe place
  // to draw this line.
  return staff.map(({ id, title, start, end, spotsLeft, full }) => ({
    id,
    title,
    start,
    end,
    spotsLeft,
    full,
  }));
}
