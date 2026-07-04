"use server";

import { dt } from "../../lib/deltat";
import { createVenue, addSchedule, daily, findRootByName, baseMs } from "../../actions/seed-helpers";

const H = 3_600_000;
const DAY = 86_400_000;
const DAYS = 24; // a little over three weeks of evening availability to scan

// Five friends, five calendars: each free in the evenings, but each busy a different weeknight and
// trimmed by a standing commitment, so the five-way intersection across three weeks is genuinely
// sparse and its shared window differs night to night. The demo finds the evenings all five share.

// An evening commitment that eats part of a friend's free band: dinner at home, kids, a standing call.
interface Commitment {
  h: [number, number]; // hours within the evening that are spoken for, e.g. [18, 19]
  dows?: number[]; // only on these weekdays (0=Sun..6=Sat); omitted means every evening
}

// Day offset from today of the nth (1-based) upcoming occurrence of weekday `dow` (0=Sun..6=Sat).
function nthDowOffset(dow: number, n: number): number {
  const today = new Date(baseMs()).getDay();
  return ((dow - today + 7) % 7) + (n - 1) * 7;
}

async function ensureFriend(
  name: string,
  open: [number, number], // evening band, e.g. [18, 23]
  busyDows: number[], // weekdays (0=Sun..6=Sat) the whole evening is gone
  commitments: Commitment[] = [], // partial-evening commitments that trim the free window
  oneOffOffsets: number[] = [] // extra full evenings blocked, as day offsets from today
): Promise<string> {
  const existing = await findRootByName(name);
  if (existing) return existing;

  const r = await createVenue(name, { slotMinutes: 30, bufferMinutes: 0 });
  const base = baseMs();
  await addSchedule(r.id, base, DAYS, daily([{ h: open[0], m: 0, dur: (open[1] - open[0]) * 60 }]));

  const blocks: { resourceId: string; start: number; end: number; blocking: boolean }[] = [];
  for (let i = 0; i < DAYS; i++) {
    const dayMs = base + i * DAY;
    const dow = new Date(dayMs).getDay();
    if (busyDows.includes(dow) || oneOffOffsets.includes(i)) {
      blocks.push({ resourceId: r.id, start: dayMs + open[0] * H, end: dayMs + open[1] * H, blocking: true });
      continue;
    }
    for (const c of commitments) {
      if (c.dows && !c.dows.includes(dow)) continue;
      blocks.push({ resourceId: r.id, start: dayMs + c.h[0] * H, end: dayMs + c.h[1] * H, blocking: true });
    }
  }
  if (blocks.length) await dt.rules.create(blocks);
  return r.id;
}

// Five friends, each busy a different weeknight, each with a standing evening commitment that trims
// their free band. The weekday blocks leave only weekends open; the commitments make the shared
// window 19:00-21:30 on Saturdays but only 19:30-21:30 on Sundays, so a 2.5 hr dinner fits Saturdays
// and not Sundays. Two one-offs knock out a weekend night apiece.
export async function ensureMeetFriends(): Promise<string[]> {
  return Promise.all([
    ensureFriend("dinner-1", [18, 23], [1], [{ h: [18, 19] }], [nthDowOffset(0, 3)]), // busy Mon; eats in until 7; away the 3rd Sunday
    ensureFriend("dinner-2", [17, 22], [2], [{ h: [21.5, 22] }]), // busy Tue; early night, gone by 9:30
    ensureFriend("dinner-3", [18, 23], [3], [], [nthDowOffset(6, 2)]), // busy Wed; away the 2nd Saturday
    ensureFriend("dinner-4", [18, 23], [4], [{ h: [18, 19.5], dows: [0] }]), // busy Thu; Sunday call until 7:30
    ensureFriend("dinner-5", [18, 23], [5], [{ h: [22, 23] }]), // busy Fri; turns in at 10
  ]);
}
