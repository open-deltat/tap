import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { ResourceMeta } from "./schemas";

// Single responsibility: persist app-level resource metadata to disk.
// slotMinutes and price are UI concerns that deltat doesn't track.

const STORE_PATH = process.env.STORE_PATH ?? "./data/web-store.json";

const meta = new Map<string, ResourceMeta>();

interface StoreData {
  resourceMeta: [string, ResourceMeta][];
}

try {
  if (existsSync(STORE_PATH)) {
    const raw = readFileSync(STORE_PATH, "utf-8");
    const data = JSON.parse(raw);
    if (data.resourceMeta) {
      for (const [k, v] of data.resourceMeta) meta.set(k, v);
    } else if (data.resources) {
      for (const [k, v] of data.resources) {
        meta.set(k, { slotMinutes: v.slotMinutes ?? 60, price: v.price ?? null });
      }
    }
  }
} catch {
  // Corrupt or missing: start fresh
}

function flush(): void {
  try {
    const dir = dirname(STORE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const data: StoreData = {
      resourceMeta: Array.from(meta.entries()),
    };
    writeFileSync(STORE_PATH, JSON.stringify(data));
  } catch (err) {
    console.error("Failed to persist store:", err);
  }
}

export function get(id: string): ResourceMeta | undefined {
  return meta.get(id);
}

export function getAll(): Map<string, ResourceMeta> {
  return meta;
}

export function set(id: string, m: ResourceMeta): void {
  meta.set(id, m);
  flush();
}

export function remove(id: string): void {
  meta.delete(id);
  flush();
}
