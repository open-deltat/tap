import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { Resource, Rule, Booking } from "./schemas";

// Persistent store for metadata that deltat doesn't track
// (resource names, prices, booking labels, etc.)
// Backed by a JSON file on disk — survives restarts.

const STORE_PATH = process.env.STORE_PATH ?? "./data/web-store.json";

const resources = new Map<string, Resource>();
const rules = new Map<string, Rule>();
const bookings = new Map<string, Booking>();
const demoVenues = new Map<string, string[]>();
let seeded = false;

interface StoreData {
  resources: [string, Resource][];
  rules: [string, Rule][];
  bookings: [string, Booking][];
  demoVenues?: [string, string[]][];
  seeded: boolean;
}

// Load from disk on module init
try {
  if (existsSync(STORE_PATH)) {
    const raw = readFileSync(STORE_PATH, "utf-8");
    const data: StoreData = JSON.parse(raw);
    for (const [k, v] of data.resources) resources.set(k, v);
    for (const [k, v] of data.rules) rules.set(k, v);
    for (const [k, v] of data.bookings) bookings.set(k, v);
    if (data.demoVenues) {
      for (const [k, v] of data.demoVenues) demoVenues.set(k, v);
    }
    seeded = data.seeded;
  }
} catch {
  // Corrupt or missing — start fresh
}

function flushNow(): void {
  try {
    const dir = dirname(STORE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const data: StoreData = {
      resources: Array.from(resources.entries()),
      rules: Array.from(rules.entries()),
      bookings: Array.from(bookings.entries()),
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
  if (!seeded) return; // bulk seed in progress, defer to markSeeded()
  flushNow();
}

// ── Resources ────────────────────────────────────────────────

export function getResources(): Resource[] {
  return Array.from(resources.values());
}

export function getResource(id: string): Resource | undefined {
  return resources.get(id);
}

export function setResource(resource: Resource): void {
  resources.set(resource.id, resource);
  flush();
}

export function removeResource(id: string): void {
  resources.delete(id);
  for (const [childId, r] of resources) {
    if (r.parentId === id) {
      removeResource(childId);
    }
  }
  for (const [ruleId, rule] of rules) {
    if (rule.resourceId === id) rules.delete(ruleId);
  }
  for (const [bookingId, booking] of bookings) {
    if (booking.resourceId === id) bookings.delete(bookingId);
  }
  flush();
}

// ── Rules ────────────────────────────────────────────────────

export function getRules(): Rule[] {
  return Array.from(rules.values());
}

export function getRulesForResource(resourceId: string): Rule[] {
  return Array.from(rules.values()).filter((r) => r.resourceId === resourceId);
}

export function setRule(rule: Rule): void {
  rules.set(rule.id, rule);
  flush();
}

export function removeRule(id: string): void {
  rules.delete(id);
  flush();
}

// ── Bookings ─────────────────────────────────────────────────

export function getBookings(): Booking[] {
  return Array.from(bookings.values());
}

export function getBookingsForResource(resourceId: string): Booking[] {
  return Array.from(bookings.values()).filter(
    (b) => b.resourceId === resourceId
  );
}

export function setBooking(booking: Booking): void {
  bookings.set(booking.id, booking);
  flush();
}

export function removeBooking(id: string): void {
  bookings.delete(id);
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
