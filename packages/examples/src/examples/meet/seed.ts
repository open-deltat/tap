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
import { FRIENDS, SLOT_MINUTES, type Commitment } from "./structure";

const H = 3_600_000;

// Five friends, five calendars: each free in the evenings, but each busy a different weeknight and
// trimmed by a standing commitment, so the five-way intersection across three weeks is genuinely
// sparse and its shared window differs night to night. The demo finds the evenings all five share.
// Who they are and when they are busy is in ./structure, which the hosted MCP's modelling guide
// reads too.

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
  const id = existing ?? (await createVenue(name, { slotMinutes: SLOT_MINUTES, bufferMinutes: 0 })).id;

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

export async function ensureMeetFriends(): Promise<string[]> {
  return Promise.all(
    FRIENDS.map((f) => ensureFriend(f.name, f.open, f.busyDows, f.commitments, f.awayOn.map((a) => nthDowOffset(a.dow, a.nth))))
  );
}
