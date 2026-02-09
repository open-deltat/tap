"use server";

import * as db from "@/lib/db";
import * as store from "@/lib/store";
import type { Resource, Rule } from "@/lib/schemas";

const DAY = 86_400_000;

function r(
  id: string,
  parentId: string | null,
  name: string,
  opts?: { slotMinutes?: number; bufferMinutes?: number; price?: number | null }
): Resource {
  return {
    id,
    parentId,
    name,
    slotMinutes: opts?.slotMinutes ?? 60,
    bufferMinutes: opts?.bufferMinutes ?? 0,
    price: opts?.price ?? null,
  };
}

async function createSeats(
  parentId: string,
  rows: (string | number)[],
  cols: (string | number)[],
  opts?: { slotMinutes?: number; bufferMinutes?: number; price?: number | null }
): Promise<Resource[]> {
  const seats: Resource[] = [];
  for (const row of rows) {
    for (const col of cols) {
      const id = await db.createResource(parentId);
      const name = `${row}${col}`;
      seats.push(r(id, parentId, name, opts));
    }
  }
  return seats;
}

/** Add availability windows based on a per-day-of-week schedule.
 *  schedule maps day-of-week (0=Sun..6=Sat) to list of {h, m, dur} windows.
 *  Days not in the map have no availability (naturally closed). */
async function addSchedule(
  resourceId: string,
  baseMs: number,
  days: number,
  schedule: Record<number, { h: number; m: number; dur: number }[]>
): Promise<Rule[]> {
  const rules: Rule[] = [];
  for (let i = 0; i < days; i++) {
    const dayMs = baseMs + i * DAY;
    const dow = new Date(dayMs).getDay();
    const shows = schedule[dow];
    if (!shows) continue;
    for (const { h, m, dur } of shows) {
      const start = dayMs + h * 3_600_000 + m * 60_000;
      const end = start + dur * 60_000;
      const id = await db.addRule(resourceId, start, end, false);
      rules.push({ id, resourceId, start, end, blocking: false });
    }
  }
  return rules;
}

/** Every day of the week gets the same windows */
function daily(
  shows: { h: number; m: number; dur: number }[]
): Record<number, { h: number; m: number; dur: number }[]> {
  return Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, shows]));
}

export async function seed(): Promise<{
  resources: Resource[];
  rules: Rule[];
}> {
  if (store.isSeeded()) {
    return { resources: store.getResources(), rules: store.getRules() };
  }

  const now = new Date();
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  const baseMs = base.getTime();
  const resources: Resource[] = [];
  const rules: Rule[] = [];

  const flightOpts = (dur: number, price: number) => ({
    slotMinutes: dur,
    bufferMinutes: 45,
    price,
  });

  // ── 1. AA-100 JFK → LAX (westward, against jet stream: 6h) ─────
  const w_id = await db.createResource(null);
  resources.push(r(w_id, null, "AA-100 JFK → LAX", { slotMinutes: 360, bufferMinutes: 45 }));

  const w_fc = await db.createResource(w_id);
  resources.push(r(w_fc, w_id, "First Class", flightOpts(360, 1200)));
  resources.push(
    ...(await createSeats(w_fc, [1], ["A", "B"], flightOpts(360, 1200)))
  );

  const w_biz = await db.createResource(w_id);
  resources.push(r(w_biz, w_id, "Business", flightOpts(360, 650)));
  resources.push(
    ...(await createSeats(w_biz, [2, 3], ["A", "B", "C", "D"], flightOpts(360, 650)))
  );

  const w_econ = await db.createResource(w_id);
  resources.push(r(w_econ, w_id, "Economy", flightOpts(360, 220)));
  resources.push(
    ...(await createSeats(
      w_econ,
      [4, 5, 6, 7, 8],
      ["A", "B", "C", "D", "E", "F"],
      flightOpts(360, 220)
    ))
  );

  // Two daily departures: 6:00 AM and 2:30 PM, 14 days ahead
  rules.push(
    ...(await addSchedule(w_id, baseMs, 14, daily([
      { h: 6, m: 0, dur: 360 },
      { h: 14, m: 30, dur: 360 },
    ])))
  );

  // ── 2. AA-205 LAX → JFK (eastward, with jet stream: 5h) ────────
  const e_id = await db.createResource(null);
  resources.push(r(e_id, null, "AA-205 LAX → JFK", { slotMinutes: 300, bufferMinutes: 45 }));

  const e_fc = await db.createResource(e_id);
  resources.push(r(e_fc, e_id, "First Class", flightOpts(300, 1100)));
  resources.push(
    ...(await createSeats(e_fc, [1], ["A", "B"], flightOpts(300, 1100)))
  );

  const e_biz = await db.createResource(e_id);
  resources.push(r(e_biz, e_id, "Business", flightOpts(300, 580)));
  resources.push(
    ...(await createSeats(e_biz, [2, 3], ["A", "B", "C", "D"], flightOpts(300, 580)))
  );

  const e_econ = await db.createResource(e_id);
  resources.push(r(e_econ, e_id, "Economy", flightOpts(300, 189)));
  resources.push(
    ...(await createSeats(
      e_econ,
      [4, 5, 6, 7, 8],
      ["A", "B", "C", "D", "E", "F"],
      flightOpts(300, 189)
    ))
  );

  // Two daily departures: 8:00 AM and 4:00 PM, 14 days ahead
  rules.push(
    ...(await addSchedule(e_id, baseMs, 14, daily([
      { h: 8, m: 0, dur: 300 },
      { h: 16, m: 0, dur: 300 },
    ])))
  );

  // ── 3. Hamilton — Richard Rodgers Theatre ──────────────────────
  const hamOpts = (price: number) => ({
    slotMinutes: 165,
    bufferMinutes: 20,
    price,
  });

  const ham_id = await db.createResource(null);
  resources.push(r(ham_id, null, "Hamilton", { slotMinutes: 165, bufferMinutes: 20 }));

  // Orchestra: rows A-D, seats 1-10
  const orch = await db.createResource(ham_id);
  resources.push(r(orch, ham_id, "Orchestra", hamOpts(349)));
  resources.push(
    ...(await createSeats(
      orch,
      ["A", "B", "C", "D"],
      Array.from({ length: 10 }, (_, i) => i + 1),
      hamOpts(349)
    ))
  );

  // Mezzanine: rows E-F, seats 1-8
  const mezz = await db.createResource(ham_id);
  resources.push(r(mezz, ham_id, "Mezzanine", hamOpts(199)));
  resources.push(
    ...(await createSeats(
      mezz,
      ["E", "F"],
      Array.from({ length: 8 }, (_, i) => i + 1),
      hamOpts(199)
    ))
  );

  // Balcony: rows G-H, seats 1-6
  const balc = await db.createResource(ham_id);
  resources.push(r(balc, ham_id, "Balcony", hamOpts(79)));
  resources.push(
    ...(await createSeats(
      balc,
      ["G", "H"],
      Array.from({ length: 6 }, (_, i) => i + 1),
      hamOpts(79)
    ))
  );

  // Broadway schedule (60 days):
  // Mon: dark, Tue: 7pm, Wed: 2pm + 7pm, Thu: 7pm
  // Fri: 8pm, Sat: 2pm + 8pm, Sun: 3pm
  rules.push(
    ...(await addSchedule(ham_id, baseMs, 60, {
      0: [{ h: 15, m: 0, dur: 165 }],                              // Sun 3pm
      // 1: Monday — dark (no entry = no availability)
      2: [{ h: 19, m: 0, dur: 165 }],                              // Tue 7pm
      3: [{ h: 14, m: 0, dur: 165 }, { h: 19, m: 0, dur: 165 }],  // Wed 2pm + 7pm
      4: [{ h: 19, m: 0, dur: 165 }],                              // Thu 7pm
      5: [{ h: 20, m: 0, dur: 165 }],                              // Fri 8pm
      6: [{ h: 14, m: 0, dur: 165 }, { h: 20, m: 0, dur: 165 }],  // Sat 2pm + 8pm
    }))
  );

  // ── 4. MetLife Stadium ─────────────────────────────────────────
  const metOpts = (price: number) => ({
    slotMinutes: 210,
    bufferMinutes: 45,
    price,
  });

  const met_id = await db.createResource(null);
  resources.push(r(met_id, null, "MetLife Stadium", { slotMinutes: 210, bufferMinutes: 45 }));

  // Floor: rows 1-2, seats A-H
  const floor = await db.createResource(met_id);
  resources.push(r(floor, met_id, "Floor", metOpts(450)));
  resources.push(
    ...(await createSeats(
      floor,
      [1, 2],
      ["A", "B", "C", "D", "E", "F", "G", "H"],
      metOpts(450)
    ))
  );

  // Lower Bowl: rows 1-3, seats A-K (skip I)
  const lower = await db.createResource(met_id);
  resources.push(r(lower, met_id, "Lower Bowl", metOpts(175)));
  resources.push(
    ...(await createSeats(
      lower,
      [1, 2, 3],
      ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K"],
      metOpts(175)
    ))
  );

  // Upper Bowl: rows 1-3, seats A-M (skip I)
  const upper = await db.createResource(met_id);
  resources.push(r(upper, met_id, "Upper Bowl", metOpts(65)));
  resources.push(
    ...(await createSeats(
      upper,
      [1, 2, 3],
      ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M"],
      metOpts(65)
    ))
  );

  // Weekend events: Fri 7pm, Sat 1pm + 7pm, Sun 4:25pm
  rules.push(
    ...(await addSchedule(met_id, baseMs, 30, {
      0: [{ h: 16, m: 25, dur: 210 }],                              // Sun 4:25pm
      5: [{ h: 19, m: 0, dur: 210 }],                               // Fri 7pm
      6: [{ h: 13, m: 0, dur: 210 }, { h: 19, m: 0, dur: 210 }],   // Sat 1pm + 7pm
    }))
  );

  // ── Persist to store ───────────────────────────────────────────
  for (const res of resources) store.setResource(res);
  for (const rule of rules) store.setRule(rule);

  store.setDemoVenues({
    airline: [w_id, e_id],
    theater: [ham_id],
    stadium: [met_id],
  });

  store.markSeeded();
  return { resources, rules };
}

export async function checkSeeded(): Promise<boolean> {
  return store.isSeeded();
}
