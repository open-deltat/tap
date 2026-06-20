"use server";

import { dt } from "@/lib/deltat";
import { createVenue, addSchedule, daily, findRootByName, baseMs } from "@/app/actions/seed-helpers";

const H = 3_600_000;
const DAY = 86_400_000;
const DAYS = 28; // recurring open hours, so any day works and there are future days to jump to
const DINNER_DAYS = 24; // a little over three weeks of evening availability

// Two scenarios for the rules + resources model:
//   studio — a recording session that needs FIVE independent resources free at once (room, engineer,
//            console, and two musicians): a hard single-day 5-way intersection.
//   dinner — five friends whose evenings rarely line up: scan three weeks to find the nights all are free.
const STUDIO = {
  studio: "Studio A",
  engineer: "Sound Engineer",
  console: "Mixing Console",
  vocalist: "Vocalist",
  guitarist: "Guitarist",
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
  // Open hours recur every day; the blocks and bookings below sit on today only, so today shows the
  // full scenario while future days stay clean (the "jump to next availability" targets).
  await addSchedule(r.id, base, DAYS, daily([{ h: setup.open[0], m: 0, dur: (setup.open[1] - setup.open[0]) * 60 }]));
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

// A dinner guest: free in the evenings, but busy on certain weeknights (recurring) and the odd one-off,
// so the five-way intersection across three weeks is genuinely sparse.
async function ensureFriend(
  name: string,
  open: [number, number], // evening band, e.g. [19, 22]
  busyDows: number[], // weekdays (0=Sun..6=Sat) blocked every week
  oneOffOffsets: number[] = [] // extra evenings blocked, as day offsets from today
): Promise<string> {
  const existing = await findRootByName(name);
  if (existing) return existing;

  const r = await createVenue(name, { slotMinutes: 30, bufferMinutes: 0 });
  const base = baseMs();
  await addSchedule(r.id, base, DINNER_DAYS, daily([{ h: open[0], m: 0, dur: (open[1] - open[0]) * 60 }]));

  const blocks: { resourceId: string; start: number; end: number; blocking: boolean }[] = [];
  for (let i = 0; i < DINNER_DAYS; i++) {
    const dayMs = base + i * DAY;
    const dow = new Date(dayMs).getDay();
    if (busyDows.includes(dow) || oneOffOffsets.includes(i)) {
      blocks.push({ resourceId: r.id, start: dayMs + open[0] * H, end: dayMs + open[1] * H, blocking: true });
    }
  }
  if (blocks.length) await dt.rules.create(blocks);
  return r.id;
}

export async function ensureRulesExample(): Promise<{ studio: string[]; dinner: string[] }> {
  // Studio session: a recording that needs the room, the engineer, the console, and two musicians all
  // free at once. Tuned so the 5-way intersection today is just two narrow windows (15:00 and 17:00).
  const studio = await ensureCalendar(STUDIO.studio, { open: [10, 22], blocks: [{ h: [14, 15], label: "Cleaning" }] });
  const engineer = await ensureCalendar(STUDIO.engineer, { open: [12, 20], bookings: [{ h: [12, 13], label: "Prep" }] });
  const mixingConsole = await ensureCalendar(STUDIO.console, { open: [10, 22], blocks: [{ h: [18, 22], label: "Out for repair" }] });
  const vocalist = await ensureCalendar(STUDIO.vocalist, { open: [13, 21], bookings: [{ h: [13, 14], label: "Warm-up" }] });
  const guitarist = await ensureCalendar(STUDIO.guitarist, { open: [11, 20], bookings: [{ h: [16, 17], label: "Lesson" }] });

  // Five friends, free in the evenings but busy on a rotating weeknight each, plus a couple of one-off
  // plans. Their evening windows differ, so when they DO all line up it is a 19:00–22:00 dinner slot.
  const dinner = await Promise.all([
    ensureFriend("dinner-1", [18, 23], [1], [1]), // busy Mondays + this coming Sunday
    ensureFriend("dinner-2", [17, 22], [2]), // busy Tuesdays
    ensureFriend("dinner-3", [19, 23], [3], [7]), // busy Wednesdays + a Saturday in week 2
    ensureFriend("dinner-4", [18, 23], [4]), // busy Thursdays
    ensureFriend("dinner-5", [18, 22], [5]), // busy Fridays
  ]);

  return { studio: [studio, engineer, mixingConsole, vocalist, guitarist], dinner };
}
