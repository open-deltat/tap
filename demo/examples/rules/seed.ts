"use server";

import { dt } from "@/lib/deltat";
import { createVenue, findRootByName, baseMs } from "@/app/actions/seed-helpers";

const H = 3_600_000;

// Two scenarios that show the rules + resources model with real data:
//   work-life  — one person with TWO calendars (work + personal) that have DIFFERENT open hours.
//   studio     — a session that needs THREE independent resources free at once (room + person + gear).
const NAMES = {
  work: "Alex · Work",
  personal: "Alex · Personal",
  studio: "Studio A",
  engineer: "Sound Engineer",
  console: "Mixing Console",
};

interface Setup {
  open: [number, number]; // [startHour, endHour] open band (a non-blocking rule)
  blocks?: { h: [number, number]; label: string }[]; // blocking rules (closed)
  bookings?: { h: [number, number]; label: string }[]; // committed bookings
}

async function ensureCalendar(name: string, setup: Setup): Promise<string> {
  const existing = await findRootByName(name);
  if (existing) return existing;

  const r = await createVenue(name, { slotMinutes: 30, bufferMinutes: 0 });
  const base = baseMs();
  await dt.rules.create([{ resourceId: r.id, start: base + setup.open[0] * H, end: base + setup.open[1] * H, blocking: false }]);
  if (setup.blocks?.length) {
    await dt.rules.create(
      setup.blocks.map((b) => ({ resourceId: r.id, start: base + b.h[0] * H, end: base + b.h[1] * H, blocking: true }))
    );
  }
  if (setup.bookings?.length) {
    await dt.bookings.create(
      setup.bookings.map((b) => ({ resourceId: r.id, start: base + b.h[0] * H, end: base + b.h[1] * H, label: b.label }))
    );
  }
  return r.id;
}

export async function ensureRulesExample(): Promise<{ worklife: string[]; studio: string[] }> {
  // Work + Personal: a person whose two calendars have different open hours and different commitments.
  const work = await ensureCalendar(NAMES.work, {
    open: [9, 17],
    blocks: [{ h: [12, 13], label: "Lunch" }],
    bookings: [
      { h: [9, 10], label: "Standup" },
      { h: [14, 15], label: "1:1" },
    ],
  });
  const personal = await ensureCalendar(NAMES.personal, {
    open: [17, 22],
    bookings: [
      { h: [18, 19], label: "Gym" },
      { h: [20, 21], label: "Dinner" },
    ],
  });

  // A studio session needs all three of these, and each keeps its own schedule.
  const studio = await ensureCalendar(NAMES.studio, {
    open: [10, 22],
    blocks: [{ h: [14, 15], label: "Cleaning" }],
  });
  const engineer = await ensureCalendar(NAMES.engineer, {
    open: [12, 20],
    blocks: [{ h: [15, 16], label: "Lunch" }],
    bookings: [{ h: [12, 13], label: "Prep" }],
  });
  const mixingConsole = await ensureCalendar(NAMES.console, {
    open: [10, 22],
    blocks: [{ h: [18, 22], label: "Out for repair" }],
  });

  return { worklife: [work, personal], studio: [studio, engineer, mixingConsole] };
}
