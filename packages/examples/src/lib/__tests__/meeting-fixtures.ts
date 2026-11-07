import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AvailabilitySlot, DeltaT } from "@open-deltat/client";
import { openBookableRegistry } from "../public-bookables";
import { openMeetingRequestStore, type RequestContact } from "../meeting-requests";
import { createMeetingService } from "../meeting-request-service";
import type { OwnerNotice } from "../notify";
import { openBookingDetailsStore } from "../booking-details";

// Shared by the meeting-request tests: a calendar that takes requests, a fake deltat that records
// what the service did to it, and a clock the test moves.

/** Namespaced per process, like the registry tests: two runs must not replay each other's files. */
export function tmpPath(name: string): string {
  const dir = join(tmpdir(), `tap_test_meetings_${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name}.json`);
  rmSync(path, { force: true });
  return path;
}

export const MIN = 60_000;
/** A Saturday morning, far enough from the wall clock that no test depends on today. */
export const NOW = Date.UTC(2036, 0, 5, 8);
/** Sunday 10:00 UTC, which is 11:00 in the calendar's zone (Europe/Berlin). */
export const T = NOW + 26 * 60 * MIN;
export const OWNER = "https://issuer.test#owner";
export const ANNA = "https://issuer.test#anna";
export const BEN = "https://issuer.test#ben";
export const annaContact: RequestContact = { name: "Anna Example", email: "anna@example.com", emailVerified: true };

/** The slice of DeltaT the meeting service uses, recording what it did. */
export function fakeDeltaT() {
  const state = {
    free: [{ start: NOW, end: NOW + 7 * 24 * 60 * MIN }] as AvailabilitySlot[],
    holdFails: false,
    /** The kernel refuses the commit: the hold is unknown or expired (SQLSTATE 42704). */
    commitFails: false,
    /** The kernel applies the commit, then the reply is lost on the way back. */
    commitReplyLost: false,
    /** The connection drops before the commit reaches the kernel: nothing is applied. */
    commitNotSent: false,
    /** The client sees the connection drop, but the kernel applies the commit later, before the next statement. */
    commitLandsLate: false,
    /** A release fails: the connection drops ("reset"), or the kernel says the hold is gone ("gone", 42704). */
    releaseFails: null as "reset" | "gone" | null,
    /** Every read of bookings fails, as during an outage. */
    readsFail: false,
    latencyMs: 0,
    holds: [] as string[],
    placed: [] as { id: string; start: number; end: number; expiresAt: number }[],
    released: [] as string[],
    bookings: [] as { id: string; label: string | undefined }[],
    cancelled: [] as string[],
    /** Kernel resources by id, as `resources.create` made them (or a test seeded them). */
    resources: new Map<string, { id: string; parentId: string | null; name: string | null; capacity: number; bufferAfter: number | null }>(),
    /** Open-hour segments each resource was given by `rules.replaceOpenHours`. */
    openHours: new Map<string, { start: number; end: number }[]>(),
    /** The next `rules.replaceOpenHours` throws, as a kernel refusal would. */
    rulesFail: false,
    /** How long each `rules.replaceOpenHours` takes, one entry per call in order; it lands at the end. */
    rulesLatencyMs: [] as number[],
    /** `resources.delete` throws, as during an outage. */
    deleteFails: false,
    /** Bookings seeded straight onto one calendar (by resource id), beside the ones holds became. */
    seededBookings: [] as { id: string; resourceId: string; start: number; end: number }[],
  };
  /** holdId -> bookingId for every commit the kernel applied: the hold is consumed, the booking takes its span. */
  const committed = new Map<string, string>();
  /**
   * A commit the kernel has received but not yet applied (commitLandsLate). It lands just before the
   * next release on the connection; a read alone does not wait for it, which is exactly the trap.
   */
  const late: { apply: (() => void) | null } = { apply: null };
  const applyCommit = (holdId: string, label: string | undefined) => {
    const booking = { id: `booking${state.bookings.length + 1}`, label };
    state.bookings.push(booking);
    committed.set(holdId, booking.id);
    return booking;
  };
  const landLateCommit = () => {
    late.apply?.();
    late.apply = null;
  };
  const pause = () => (state.latencyMs ? Bun.sleep(state.latencyMs) : Promise.resolve());
  const overlaps = (s: { start: number; end: number }, f?: { start?: number; end?: number }) =>
    (f?.end === undefined || s.start < f.end) && (f?.start === undefined || s.end > f.start);
  const connectionReset = () => Object.assign(new Error("read ECONNRESET"), { errno: -54 });
  const readOrFail = () => {
    if (state.readsFail) throw connectionReset();
  };
  const dt = {
    resources: {
      create: async (opts?: { name?: string; capacity?: number; bufferAfter?: number | null }) => {
        const id = `res${state.resources.size + 1}`;
        const resource = { id, parentId: null, name: opts?.name ?? null, capacity: opts?.capacity ?? 1, bufferAfter: opts?.bufferAfter ?? null };
        state.resources.set(id, resource);
        return resource;
      },
      find: async (id: string) => state.resources.get(id) ?? null,
      update: async (id: string, opts: { name?: string; capacity?: number; bufferAfter?: number | null }) => {
        const current = state.resources.get(id);
        if (!current) throw Object.assign(new Error("unknown resource"), { code: "42704" });
        state.resources.set(id, {
          ...current,
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.capacity !== undefined && { capacity: opts.capacity }),
          ...(opts.bufferAfter !== undefined && { bufferAfter: opts.bufferAfter }),
        });
      },
      delete: async (id: string) => {
        if (state.deleteFails) throw connectionReset();
        state.resources.delete(id);
        state.openHours.delete(id);
      },
    },
    rules: {
      replaceOpenHours: async (resourceId: string, segments: { start: number; end: number }[]) => {
        const delay = state.rulesLatencyMs.shift();
        if (delay) await Bun.sleep(delay);
        if (state.rulesFail) throw Object.assign(new Error("span is outside the parent's availability"), { code: "23514" });
        state.openHours.set(resourceId, segments);
      },
    },
    availability: {
      get: async ({ start, end }: { start: number; end: number }) =>
        state.free
          .filter((s) => s.end > start && s.start < end)
          .map((s) => ({ start: Math.max(s.start, start), end: Math.min(s.end, end) })),
    },
    holds: {
      place: async (h: { start: number; end: number; expiresAt: number }) => {
        await pause();
        if (state.holdFails) throw Object.assign(new Error("span is already allocated"), { code: "40001" });
        const id = `hold${state.holds.length + 1}`;
        state.holds.push(id);
        state.placed.push({ id, start: h.start, end: h.end, expiresAt: h.expiresAt });
        return { id, expiresAt: h.expiresAt };
      },
      commit: async (holdId: string, opts?: { label?: string }) => {
        await pause();
        if (state.commitFails) throw Object.assign(new Error("unknown hold (expired?)"), { code: "42704" });
        if (state.commitNotSent) throw connectionReset();
        if (state.commitLandsLate) {
          late.apply = () => applyCommit(holdId, opts?.label);
          throw connectionReset();
        }
        const booking = applyCommit(holdId, opts?.label);
        if (state.commitReplyLost) throw connectionReset();
        return { bookingId: booking.id, holdId };
      },
      release: async (holdId: string) => {
        landLateCommit();
        if (state.releaseFails === "reset") throw connectionReset();
        if (state.releaseFails === "gone") throw Object.assign(new Error("unknown hold"), { code: "42704" });
        state.released.push(holdId);
      },
      get: async (resourceId: string) => {
        readOrFail();
        return state.placed
          .filter((h) => !state.released.includes(h.id) && !committed.has(h.id))
          .map((h) => ({ ...h, resourceId }));
      },
    },
    bookings: {
      cancel: async (id: string) => {
        state.cancelled.push(id);
      },
      get: async (resourceId: string, filter?: { start?: number; end?: number }) => {
        readOrFail();
        const fromHolds = [...committed].flatMap(([holdId, bookingId]) => {
          const span = state.placed.find((h) => h.id === holdId);
          const booking = state.bookings.find((b) => b.id === bookingId);
          return span && booking && !state.cancelled.includes(bookingId) && overlaps(span, filter)
            ? [{ id: bookingId, resourceId, start: span.start, end: span.end, label: booking.label ?? null }]
            : [];
        });
        const seeded = state.seededBookings
          .filter((b) => b.resourceId === resourceId && !state.cancelled.includes(b.id) && overlaps(b, filter))
          .map((b) => ({ ...b, label: "Seeded" }));
        return [...fromHolds, ...seeded];
      },
    },
  };
  // Only the members above exist; the cast stands in for the rest of the client.
  return { dt: dt as unknown as DeltaT, state };
}

/** One calendar, "cal1", owned by OWNER, in the given booking mode, with a service over it. */
export function setupMeetings(opts: { mode?: "instant" | "request"; reviewBase?: string } = {}) {
  const clock = { now: NOW };
  const registry = openBookableRegistry(tmpPath(`registry_${crypto.randomUUID()}`));
  registry.register({ id: "cal1", name: "Simon's week", slotMinutes: 30, timezone: "Europe/Berlin", owner: OWNER });
  registry.updateOwned("cal1", OWNER, { bookingMode: opts.mode ?? "request" });
  const store = openMeetingRequestStore(tmpPath(`requests_${crypto.randomUUID()}`), { now: () => clock.now });
  const notices: OwnerNotice[] = [];
  const { dt, state } = fakeDeltaT();
  // The registry entry's kernel twin, so a read of the calendar's resource finds it.
  state.resources.set("cal1", { id: "cal1", parentId: null, name: "Simon's week", capacity: 1, bufferAfter: null });
  const details = openBookingDetailsStore(tmpPath(`details_${crypto.randomUUID()}`), { now: () => clock.now });
  const service = createMeetingService({
    dt,
    registry,
    store,
    details,
    notify: async (n) => {
      notices.push(n);
    },
    reviewBase: opts.reviewBase ?? null,
    now: () => clock.now,
  });
  const ask = (overrides: Partial<Parameters<typeof service.request>[0]> = {}) =>
    service.request({ calendarId: "cal1", requester: ANNA, contact: annaContact, start: T, end: T + 30 * MIN, ...overrides });
  return { registry, store, service, state, notices, clock, dt, ask, details };
}
