import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { ResourceMeta } from "./schemas";

// Persistent store for app-level metadata that deltat doesn't track
// (slot duration, prices). Rules, bookings, holds live in deltat only.
// Backed by a JSON file on disk — survives restarts.

const STORE_PATH = process.env.STORE_PATH ?? "./data/web-store.json";

const resourceMeta = new Map<string, ResourceMeta>();
const demoVenues = new Map<string, string[]>();
let seeded = false;

interface StoreData {
  resourceMeta: [string, ResourceMeta][];
  demoVenues?: [string, string[]][];
  seeded: boolean;
}

// Load from disk on module init
try {
  if (existsSync(STORE_PATH)) {
    const raw = readFileSync(STORE_PATH, "utf-8");
    const data = JSON.parse(raw);
    if (data.resourceMeta) {
      for (const [k, v] of data.resourceMeta) resourceMeta.set(k, v);
    } else if (data.resources) {
      // Migrate from old store format
      for (const [k, v] of data.resources) {
        resourceMeta.set(k, {
          slotMinutes: v.slotMinutes ?? 60,
          bufferMinutes: v.bufferMinutes ?? 0,
          price: v.price ?? null,
        });
      }
    }
    if (data.demoVenues) {
      for (const [k, v] of data.demoVenues) demoVenues.set(k, v);
    }
    seeded = data.seeded ?? false;
  }
} catch {
  // Corrupt or missing — start fresh
}

function flushNow(): void {
  try {
    const dir = dirname(STORE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const data: StoreData = {
      resourceMeta: Array.from(resourceMeta.entries()),
      demoVenues: Array.from(demoVenues.entries()),
      seeded,
    };
    writeFileSync(STORE_PATH, JSON.stringify(data));
  } catch (err) {
    console.error("Failed to persist store:", err);
  }
}

/** Flush to disk — skipped during seed (batched at markSeeded) */
function flush(): void {
  if (!seeded) return;
  flushNow();
}

// ── Resource Metadata ────────────────────────────────────────

export function getMeta(id: string): ResourceMeta | undefined {
  return resourceMeta.get(id);
}

export function getAllMeta(): Map<string, ResourceMeta> {
  return resourceMeta;
}

export function setMeta(id: string, meta: ResourceMeta): void {
  resourceMeta.set(id, meta);
  flush();
}

export function removeMeta(id: string): void {
  resourceMeta.delete(id);
  flush();
}

// ── Demo Venues ─────────────────────────────────────────────

export function setDemoVenues(mapping: Record<string, string[]>): void {
  for (const [demo, ids] of Object.entries(mapping)) {
    demoVenues.set(demo, ids);
  }
}

export function getDemoVenueIds(demo: string): string[] {
  return demoVenues.get(demo) ?? [];
}

// ── Seed flag ────────────────────────────────────────────────

export function isSeeded(): boolean {
  return seeded;
}

export function markSeeded(): void {
  seeded = true;
  flushNow(); // single write for the entire seed batch
}
