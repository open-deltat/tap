"use server";

import { dt } from "../../lib/deltat";
import { callerIp } from "../../lib/caller";
import { createRateLimiter } from "../../lib/rate-limit";
import { ensureGym } from "./seed";

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

// A demo-grade guard against a public bookable embed: cap bookings per client IP. In-memory and
// single-instance, enough to keep the demo standing under a crowd. A real deployment would swap this
// for a shared store plus a confirm-time identity or deposit (the no-show fix, VIS-08).
const gymBookings = createRateLimiter({ limit: 6, windowMs: 60_000 });

// Book one spot in a class. The client only knows the rule (class occurrence) id; the course id and
// its capacity stay on the server, so booking cannot leak the roster any more than the read does.
// deltat's capacity-aware conflict check is the real overbooking guard: if the class filled between
// the read and here, create() rejects it and we surface that.
export async function bookGymClass(ruleId: string, name?: string): Promise<{ spotsLeft: number; full: boolean }> {
  if (!gymBookings.check(await callerIp()).allowed) {
    throw new Error("Too many bookings from here just now. Give it a minute.");
  }

  const { courses } = await ensureGym();
  for (const course of courses) {
    const rules = await dt.rules.get(course.id);
    const rule = rules.find((r) => r.id === ruleId && !r.blocking);
    if (!rule) continue;

    const bookings = await dt.bookings.get(course.id, { start: rule.start, end: rule.end });
    const booked = bookings.filter((b) => b.start < rule.end && b.end > rule.start).length;
    if (booked >= course.capacity) throw new Error("That class just filled up.");

    await dt.bookings.create([
      { resourceId: course.id, start: rule.start, end: rule.end, label: name?.trim() || "Guest" },
    ]);
    const spotsLeft = Math.max(0, course.capacity - booked - 1);
    return { spotsLeft, full: spotsLeft === 0 };
  }
  throw new Error("Class not found.");
}
