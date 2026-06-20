"use server";

import { dt } from "@/lib/deltat";
import { createVenue, addSchedule, findRootByName, baseMs } from "@/app/actions/seed-helpers";

const H = 3_600_000;
const DAY = 86_400_000;
const DAYS = 28; // four weeks of recurring availability + meetings

type Win = { h: number; m: number; dur: number };
type Booking = { h: number; dur: number; label: string };

// A weekly OPEN-HOURS pattern (keyed by day-of-week 0=Sun..6=Sat) and a weekly MEETINGS pattern.
// The two people work different hours and carry different recurring meetings, so every weekday
// shows a genuinely different gap structure — and the both-free intersection differs each day,
// instead of "free forever after today".
async function ensurePerson(
  name: string,
  hours: Record<number, Win[]>,
  meetings: Record<number, Booking[]>
): Promise<string> {
  const existing = await findRootByName(name);
  if (existing) return existing;

  const cal = await createVenue(name, { slotMinutes: 30, bufferMinutes: 0 });
  await addSchedule(cal.id, baseMs(), DAYS, hours);

  const base = baseMs();
  const rows: { resourceId: string; start: number; end: number; label: string }[] = [];
  for (let i = 0; i < DAYS; i++) {
    const dayMs = base + i * DAY;
    const dow = new Date(dayMs).getDay();
    for (const b of meetings[dow] ?? []) {
      const start = dayMs + b.h * H;
      rows.push({ resourceId: cal.id, start, end: start + b.dur * H, label: b.label });
    }
  }
  if (rows.length) await dt.bookings.create(rows);
  return cal.id;
}

// Jane: Mon–Fri 09:00–17:00.   Bob: Mon–Fri 08:00–16:00 (earlier, so mornings/evenings differ).
const JANE_HOURS: Record<number, Win[]> = { 1: [{ h: 9, m: 0, dur: 480 }], 2: [{ h: 9, m: 0, dur: 480 }], 3: [{ h: 9, m: 0, dur: 480 }], 4: [{ h: 9, m: 0, dur: 480 }], 5: [{ h: 9, m: 0, dur: 480 }] };
const BOB_HOURS: Record<number, Win[]> = { 1: [{ h: 8, m: 0, dur: 480 }], 2: [{ h: 8, m: 0, dur: 480 }], 3: [{ h: 8, m: 0, dur: 480 }], 4: [{ h: 8, m: 0, dur: 480 }], 5: [{ h: 8, m: 0, dur: 480 }] };

const JANE_MEETINGS: Record<number, Booking[]> = {
  1: [{ h: 9, dur: 1, label: "Standup" }, { h: 14, dur: 1, label: "1:1" }],
  2: [{ h: 11, dur: 1, label: "Design review" }],
  3: [{ h: 9, dur: 2, label: "Workshop" }],
  4: [{ h: 15, dur: 1, label: "Retro" }],
  5: [{ h: 10, dur: 2, label: "Planning" }],
};
const BOB_MEETINGS: Record<number, Booking[]> = {
  1: [{ h: 13, dur: 2, label: "Interviews" }],
  2: [{ h: 8, dur: 1, label: "Standup" }, { h: 14, dur: 1, label: "Sync" }],
  3: [{ h: 12, dur: 1, label: "Lunch & learn" }],
  4: [{ h: 9, dur: 2, label: "Deep work" }],
  5: [{ h: 14, dur: 2, label: "Demo" }],
};

export async function ensureMeetCalendars(): Promise<{ janeId: string; bobId: string }> {
  const janeId = await ensurePerson("Jane", JANE_HOURS, JANE_MEETINGS);
  const bobId = await ensurePerson("Bob", BOB_HOURS, BOB_MEETINGS);
  return { janeId, bobId };
}
