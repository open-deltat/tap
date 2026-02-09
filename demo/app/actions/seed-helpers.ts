import { dt } from "@/lib/deltat";
import * as store from "@/lib/store";
import type { Resource, ResourceMeta } from "@/lib/schemas";
import type { Rule } from "@open-tap/client";

const DAY = 86_400_000;

function toMeta(opts: { slotMinutes: number; price: number | null }): ResourceMeta {
  return { slotMinutes: opts.slotMinutes, price: opts.price };
}

export async function createVenue(
  name: string,
  opts: { slotMinutes: number; bufferMinutes: number }
): Promise<Resource> {
  const r = await dt.resources.create({
    name,
    bufferAfter: opts.bufferMinutes * 60_000 || undefined,
  });
  const m = toMeta({ slotMinutes: opts.slotMinutes, price: null });
  store.set(r.id, m);
  return { ...r, ...m, bufferMinutes: opts.bufferMinutes };
}

export async function createSection(
  parentId: string,
  name: string,
  opts: { slotMinutes: number; bufferMinutes: number; price: number }
): Promise<Resource> {
  const r = await dt.resources.create({
    parentId,
    name,
    bufferAfter: opts.bufferMinutes * 60_000 || undefined,
  });
  const m = toMeta({ slotMinutes: opts.slotMinutes, price: opts.price });
  store.set(r.id, m);
  return { ...r, ...m, bufferMinutes: opts.bufferMinutes };
}

export async function createSeats(
  parentId: string,
  rows: (string | number)[],
  cols: (string | number)[],
  opts: { slotMinutes: number; bufferMinutes: number; price: number }
): Promise<Resource[]> {
  const seats: Resource[] = [];
  for (const row of rows) {
    for (const col of cols) {
      const name = `${row}${col}`;
      const r = await dt.resources.create({
        parentId,
        name,
        bufferAfter: opts.bufferMinutes * 60_000 || undefined,
      });
      const m = toMeta({ slotMinutes: opts.slotMinutes, price: opts.price });
      store.set(r.id, m);
      seats.push({ ...r, ...m, bufferMinutes: opts.bufferMinutes });
    }
  }
  return seats;
}

export async function addSchedule(
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
      const rule = await dt.rules.add({ resourceId, start, end, blocking: false });
      rules.push(rule);
    }
  }
  return rules;
}

export function daily(
  shows: { h: number; m: number; dur: number }[]
): Record<number, { h: number; m: number; dur: number }[]> {
  return Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, shows]));
}

export async function findRootByName(name: string): Promise<string | null> {
  const roots = await dt.resources.get({ roots: true });
  const found = roots.find((r) => r.name === name);
  return found?.id ?? null;
}

export function baseMs(): number {
  const now = new Date();
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  return base.getTime();
}
