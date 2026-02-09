"use server";

import { dt } from "@/lib/deltat";
import * as store from "@/lib/store";
import type { Resource, ResourceMeta } from "@/lib/schemas";
import type { Rule } from "@open-tap/client";

const DAY = 86_400_000;

function meta(
  opts?: { slotMinutes?: number; bufferMinutes?: number; price?: number | null }
): ResourceMeta {
  return {
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
  const m = meta(opts);
  const seats: Resource[] = [];
  for (const row of rows) {
    for (const col of cols) {
      const name = `${row}${col}`;
      const r = await dt.createResource({
        parentId,
        name,
        bufferAfter: m.bufferMinutes * 60_000 || undefined,
      });
      store.setMeta(r.id, m);
      seats.push({ ...r, ...m });
    }
  }
  return seats;
}

/** Add availability windows based on a per-day-of-week schedule. */
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
      const rule = await dt.addRule({ resourceId, start, end, blocking: false });
      rules.push(rule);
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

/** Create a top-level resource + store its metadata */
async function createVenue(
  name: string,
  opts: { slotMinutes: number; bufferMinutes: number }
): Promise<Resource> {
  const r = await dt.createResource({
    name,
    bufferAfter: opts.bufferMinutes * 60_000 || undefined,
  });
  const m = meta(opts);
  store.setMeta(r.id, m);
  return { ...r, ...m };
}

/** Create a section under a venue */
async function createSection(
  parentId: string,
  name: string,
  opts: { slotMinutes: number; bufferMinutes: number; price: number }
): Promise<Resource> {
  const r = await dt.createResource({
    parentId,
    name,
    bufferAfter: opts.bufferMinutes * 60_000 || undefined,
  });
  const m = meta(opts);
  store.setMeta(r.id, m);
  return { ...r, ...m };
}

export async function seed(): Promise<{
  resources: Resource[];
  rules: Rule[];
}> {
  if (store.isSeeded()) {
    // Already seeded — return current state
    const dtResources = await dt.getResources();
    const allMeta = store.getAllMeta();
    const resources = dtResources.map((r) => ({
      ...r,
      ...(allMeta.get(r.id) ?? meta()),
    }));
    return { resources, rules: [] };
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

  // ── 1. AA-100 JFK → LAX (westward, 6h) ────────────────────
  const w = await createVenue("AA-100 JFK → LAX", { slotMinutes: 360, bufferMinutes: 45 });
  resources.push(w);

  const w_fc = await createSection(w.id, "First Class", flightOpts(360, 1200));
  resources.push(w_fc);
  resources.push(...(await createSeats(w_fc.id, [1], ["A", "B"], flightOpts(360, 1200))));

  const w_biz = await createSection(w.id, "Business", flightOpts(360, 650));
  resources.push(w_biz);
  resources.push(...(await createSeats(w_biz.id, [2, 3], ["A", "B", "C", "D"], flightOpts(360, 650))));

  const w_econ = await createSection(w.id, "Economy", flightOpts(360, 220));
  resources.push(w_econ);
  resources.push(
    ...(await createSeats(w_econ.id, [4, 5, 6, 7, 8], ["A", "B", "C", "D", "E", "F"], flightOpts(360, 220)))
  );

  rules.push(
    ...(await addSchedule(w.id, baseMs, 14, daily([
      { h: 6, m: 0, dur: 360 },
      { h: 14, m: 30, dur: 360 },
    ])))
  );

  // ── 2. AA-205 LAX → JFK (eastward, 5h) ────────────────────
  const e = await createVenue("AA-205 LAX → JFK", { slotMinutes: 300, bufferMinutes: 45 });
  resources.push(e);

  const e_fc = await createSection(e.id, "First Class", flightOpts(300, 1100));
  resources.push(e_fc);
  resources.push(...(await createSeats(e_fc.id, [1], ["A", "B"], flightOpts(300, 1100))));

  const e_biz = await createSection(e.id, "Business", flightOpts(300, 580));
  resources.push(e_biz);
  resources.push(...(await createSeats(e_biz.id, [2, 3], ["A", "B", "C", "D"], flightOpts(300, 580))));

  const e_econ = await createSection(e.id, "Economy", flightOpts(300, 189));
  resources.push(e_econ);
  resources.push(
    ...(await createSeats(e_econ.id, [4, 5, 6, 7, 8], ["A", "B", "C", "D", "E", "F"], flightOpts(300, 189)))
  );

  rules.push(
    ...(await addSchedule(e.id, baseMs, 14, daily([
      { h: 8, m: 0, dur: 300 },
      { h: 16, m: 0, dur: 300 },
    ])))
  );

  // ── 3. Hamilton — Richard Rodgers Theatre ──────────────────
  const hamOpts = (price: number) => ({
    slotMinutes: 165,
    bufferMinutes: 20,
    price,
  });

  const ham = await createVenue("Hamilton", { slotMinutes: 165, bufferMinutes: 20 });
  resources.push(ham);

  const orch = await createSection(ham.id, "Orchestra", hamOpts(349));
  resources.push(orch);
  resources.push(
    ...(await createSeats(orch.id, ["A", "B", "C", "D"], Array.from({ length: 10 }, (_, i) => i + 1), hamOpts(349)))
  );

  const mezz = await createSection(ham.id, "Mezzanine", hamOpts(199));
  resources.push(mezz);
  resources.push(
    ...(await createSeats(mezz.id, ["E", "F"], Array.from({ length: 8 }, (_, i) => i + 1), hamOpts(199)))
  );

  const balc = await createSection(ham.id, "Balcony", hamOpts(79));
  resources.push(balc);
  resources.push(
    ...(await createSeats(balc.id, ["G", "H"], Array.from({ length: 6 }, (_, i) => i + 1), hamOpts(79)))
  );

  rules.push(
    ...(await addSchedule(ham.id, baseMs, 60, {
      0: [{ h: 15, m: 0, dur: 165 }],
      2: [{ h: 19, m: 0, dur: 165 }],
      3: [{ h: 14, m: 0, dur: 165 }, { h: 19, m: 0, dur: 165 }],
      4: [{ h: 19, m: 0, dur: 165 }],
      5: [{ h: 20, m: 0, dur: 165 }],
      6: [{ h: 14, m: 0, dur: 165 }, { h: 20, m: 0, dur: 165 }],
    }))
  );

  // ── 4. MetLife Stadium ─────────────────────────────────────
  const metOpts = (price: number) => ({
    slotMinutes: 210,
    bufferMinutes: 45,
    price,
  });

  const met = await createVenue("MetLife Stadium", { slotMinutes: 210, bufferMinutes: 45 });
  resources.push(met);

  const floor = await createSection(met.id, "Floor", metOpts(450));
  resources.push(floor);
  resources.push(
    ...(await createSeats(floor.id, [1, 2], ["A", "B", "C", "D", "E", "F", "G", "H"], metOpts(450)))
  );

  const lower = await createSection(met.id, "Lower Bowl", metOpts(175));
  resources.push(lower);
  resources.push(
    ...(await createSeats(lower.id, [1, 2, 3], ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K"], metOpts(175)))
  );

  const upper = await createSection(met.id, "Upper Bowl", metOpts(65));
  resources.push(upper);
  resources.push(
    ...(await createSeats(upper.id, [1, 2, 3], ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M"], metOpts(65)))
  );

  rules.push(
    ...(await addSchedule(met.id, baseMs, 30, {
      0: [{ h: 16, m: 25, dur: 210 }],
      5: [{ h: 19, m: 0, dur: 210 }],
      6: [{ h: 13, m: 0, dur: 210 }, { h: 19, m: 0, dur: 210 }],
    }))
  );

  // ── Persist demo venue mapping ─────────────────────────────
  store.setDemoVenues({
    airline: [w.id, e.id],
    theater: [ham.id],
    stadium: [met.id],
  });

  store.markSeeded();
  return { resources, rules };
}

export async function checkSeeded(): Promise<boolean> {
  return store.isSeeded();
}
