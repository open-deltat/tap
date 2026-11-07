import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Who booked: name, email and note, kept by the app against the kernel's booking id.
 *
 * deltat is a timeline database and holds time only (NOT-02, GAP-02). A booking's kernel label is an
 * opaque reference (`opaqueRef`), never a person's name, so the WAL holds nothing to erase. These
 * rows are the one place the person is written.
 *
 * - Write order: the kernel booking first (it can refuse), then this row. A row whose booking the
 *   kernel no longer has (cancelled, collected, or never landed) is hidden on read, because readers
 *   join from the kernel's bookings, and is removed by `sweep` (start-up and daily, demo/server.ts).
 * - Erase (a data-subject request, or an owner's cancel): `erase({ bookingId })` or
 *   `erase({ email })` deletes the rows outright. The kernel booking, being time only, needs nothing.
 *   Meeting requests keep the requester's contact in their own store; erase that there as well.
 * - Bookings made before this store existed have the name in their label. `whoBooked` reads it as a
 *   fallback marked `legacy`; the WAL is not rewritten.
 *
 * Async throughout, so a Postgres implementation can replace this JSON file without any caller
 * changing. Today: one file, one process, like the registry beside it.
 */

export type BookingSource = "web" | "pass" | "meeting_request";

export interface BookingDetails {
  readonly bookingId: string;
  readonly calendarId: string;
  readonly name: string;
  readonly email: string | null;
  readonly note: string | null;
  readonly source: BookingSource;
  readonly createdAt: number;
}

export interface BookingDetailsStore {
  put(details: BookingDetails): Promise<void>;
  get(bookingId: string): Promise<BookingDetails | undefined>;
  forCalendar(calendarId: string): Promise<BookingDetails[]>;
  /** Delete the rows for one booking, or every row with this email (case-insensitive). Returns how many. */
  erase(match: { bookingId: string } | { email: string }): Promise<number>;
  /**
   * Remove rows whose booking the kernel no longer has. `liveIds` answers one calendar's current
   * booking ids, or null when it cannot tell (that calendar's rows are kept). Rows younger than the
   * grace period are kept too: their booking may be newer than the read. Returns how many went.
   */
  sweep(liveIds: (calendarId: string) => Promise<ReadonlySet<string> | null>): Promise<number>;
}

/** Long enough that a row is never older than the kernel read the sweep compares it with. */
const SWEEP_GRACE_MS = 60 * 60 * 1000;
const MAX_ROWS = 100_000;

const REF_PREFIX = "ref_";

/** A kernel label that says nothing about anyone, unique per booking so a lost reply can still find it. */
export const opaqueRef = (): string => `${REF_PREFIX}${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;

export const isOpaqueRef = (label: string): boolean => label.startsWith(REF_PREFIX) && !label.includes(" ");

export interface Who {
  readonly name: string;
  readonly email: string | null;
  readonly note: string | null;
  /** Read from an old kernel label, written before names left the kernel. */
  readonly legacy: boolean;
}

/** Who booked, for the owner: the details row, else a legacy name in the label, else nobody known. */
export function whoBooked(booking: { label: string | null }, details: BookingDetails | undefined): Who | null {
  if (details) return { name: details.name, email: details.email, note: details.note, legacy: false };
  const label = booking.label?.trim();
  return label && !isOpaqueRef(label) ? { name: label, email: null, note: null, legacy: true } : null;
}

/** A kernel booking as an authorized reader sees it: its time, and who booked it. The label stays behind. */
export interface BookingWithWho {
  readonly id: string;
  readonly resourceId: string;
  readonly start: number;
  readonly end: number;
  readonly who: Who | null;
}

/**
 * Join the kernel's bookings with their details. Joined from the kernel's side, so a details row
 * whose booking is gone is never shown, whatever the sweep has or has not removed yet.
 */
export async function withWho(
  store: BookingDetailsStore,
  bookings: readonly { id: string; resourceId: string; start: number; end: number; label: string | null }[]
): Promise<BookingWithWho[]> {
  return Promise.all(
    bookings.map(async (b) => ({
      id: b.id,
      resourceId: b.resourceId,
      start: b.start,
      end: b.end,
      who: whoBooked(b, await store.get(b.id).catch(() => undefined)),
    }))
  );
}

const SOURCES: readonly BookingSource[] = ["web", "pass", "meeting_request"];
const isNullableString = (v: unknown) => v === null || typeof v === "string";

function isDetails(v: unknown): v is BookingDetails {
  if (typeof v !== "object" || v === null) return false;
  const r: Record<string, unknown> = Object.fromEntries(Object.entries(v));
  return (
    typeof r.bookingId === "string" &&
    typeof r.calendarId === "string" &&
    typeof r.name === "string" &&
    isNullableString(r.email) &&
    isNullableString(r.note) &&
    SOURCES.some((s) => s === r.source) &&
    typeof r.createdAt === "number"
  );
}

function load(path: string): Map<string, BookingDetails> {
  try {
    if (!existsSync(path)) return new Map();
    const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
    const rows = typeof parsed === "object" && parsed !== null ? Object.fromEntries(Object.entries(parsed)).rows : undefined;
    return Array.isArray(rows) ? new Map(rows.filter(isDetails).map((d) => [d.bookingId, d])) : new Map();
  } catch {
    return new Map();
  }
}

const sameEmail = (a: string | null, b: string) => a !== null && a.trim().toLowerCase() === b.trim().toLowerCase();

export function openBookingDetailsStore(path: string, opts?: { now?: () => number }): BookingDetailsStore {
  const now = opts?.now ?? Date.now;
  const rows = load(path);

  // Sibling then rename, so a crash mid-write cannot truncate every row at once.
  const flush = (): void => {
    const dir = dirname(path);
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify({ version: 1, rows: [...rows.values()] }));
    renameSync(tmp, path);
  };
  const remove = (ids: readonly string[]): number => {
    ids.forEach((id) => rows.delete(id));
    if (ids.length > 0) flush();
    return ids.length;
  };

  return {
    async put(details) {
      if (!rows.has(details.bookingId) && rows.size >= MAX_ROWS) throw new Error("Too many booking details are stored right now.");
      rows.set(details.bookingId, details);
      flush();
    },
    async get(bookingId) {
      return rows.get(bookingId);
    },
    async forCalendar(calendarId) {
      return [...rows.values()].filter((d) => d.calendarId === calendarId);
    },
    async erase(match) {
      const ids = [...rows.values()]
        .filter((d) => ("bookingId" in match ? d.bookingId === match.bookingId : sameEmail(d.email, match.email)))
        .map((d) => d.bookingId);
      return remove(ids);
    },
    async sweep(liveIds) {
      const cutoff = now() - SWEEP_GRACE_MS;
      const calendars = [...new Set([...rows.values()].map((d) => d.calendarId))];
      const live = new Map(await Promise.all(calendars.map(async (c) => [c, await liveIds(c).catch(() => null)] as const)));
      const orphans = [...rows.values()]
        .filter((d) => d.createdAt < cutoff)
        .filter((d) => {
          const ids = live.get(d.calendarId);
          return ids !== null && ids !== undefined && !ids.has(d.bookingId);
        })
        .map((d) => d.bookingId);
      return remove(orphans);
    },
  };
}
