"use server";

import { dt } from "../../lib/deltat";
import {
  createVenue,
  ensureSchedule,
  daily,
  findRootByName,
  baseMs,
  addLocalDays,
  startOfLocalDay,
} from "../../actions/seed-helpers";

const H = 3_600_000;

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
  const id = existing ?? (await createVenue(name, { slotMinutes: 30, bufferMinutes: 0 })).id;

  // Block only the evenings this call actually opened. That keeps a top-up from re-blocking days
  // it already blocked, and stops newly opened evenings from reading as suspiciously wide open,
  // which would quietly turn the five-way intersection into a trivial one.
  const opened = await ensureSchedule(id, daily([{ h: open[0], m: 0, dur: (open[1] - open[0]) * 60 }]));

  // One-offs are "the 3rd Sunday from today", so they only make sense on the first seed.
  const oneOffDays = existing ? [] : oneOffOffsets.map((i) => addLocalDays(baseMs(), i));

  const blocks = opened.flatMap((evening) => {
    const day = startOfLocalDay(evening.start);
    const dow = new Date(day).getDay();
    if (busyDows.includes(dow) || oneOffDays.includes(day)) {
      return [{ resourceId: id, start: evening.start, end: evening.end, blocking: true }];
    }
    return commitments
      .filter((c) => !c.dows || c.dows.includes(dow))
      .map((c) => ({ resourceId: id, start: day + c.h[0] * H, end: day + c.h[1] * H, blocking: true }));
  });
  if (blocks.length) await dt.rules.create(blocks);
  return id;
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
