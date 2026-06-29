"use server";

import { dt } from "@/lib/deltat";
import { ensureGym } from "@/examples/gym/seed";

// The published schedule: the class, when it runs, and how many spots are left, a free count and
// never the capacity denominator or the roster. deltat does no field-level auth (every read sees
// every column), so the trusted edge derives spots-left here and emits only these public fields.
export interface PublicClass {
  id: string;
  title: string;
  start: number;
  end: number;
  spotsLeft: number;
  full: boolean;
}

export async function getPublicSchedule(start: number, end: number): Promise<PublicClass[]> {
  const { courses } = await ensureGym();
  const out: PublicClass[] = [];

  for (const course of courses) {
    const [rules, bookings] = await Promise.all([
      dt.rules.get(course.id),
      dt.bookings.get(course.id, { start, end }),
    ]);

    for (const rule of rules) {
      if (rule.blocking) continue;
      if (rule.end <= start || rule.start >= end) continue; // not in window

      const booked = bookings.filter((b) => b.start < rule.end && b.end > rule.start).length;
      const spotsLeft = Math.max(0, course.capacity - booked);

      out.push({ id: rule.id, title: course.name, start: rule.start, end: rule.end, spotsLeft, full: spotsLeft === 0 });
    }
  }

  out.sort((a, b) => a.start - b.start);
  return out;
}

// The client needs only the seeded coverage window (to clamp month navigation), never the course
// list or capacities. Returning just {start,end} keeps capacity server-side so it can't be diffed
// against spotsLeft to reconstruct the roster.
export async function getScheduleWindow(): Promise<{ start: number; end: number }> {
  const { window } = await ensureGym();
  return window;
}
