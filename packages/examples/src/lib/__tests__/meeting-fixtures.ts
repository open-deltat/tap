import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AvailabilitySlot, DeltaT } from "@open-deltat/client";
import { openBookableRegistry } from "../public-bookables";
import { openMeetingRequestStore, type RequestContact } from "../meeting-requests";
import { createMeetingService } from "../meeting-request-service";
import type { OwnerNotice } from "../notify";

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
    commitFails: false,
    latencyMs: 0,
    holds: [] as string[],
    released: [] as string[],
    bookings: [] as { id: string; label: string | undefined }[],
    cancelled: [] as string[],
  };
  const pause = () => (state.latencyMs ? Bun.sleep(state.latencyMs) : Promise.resolve());
  const dt = {
    availability: {
      get: async ({ start, end }: { start: number; end: number }) =>
        state.free
          .filter((s) => s.end > start && s.start < end)
          .map((s) => ({ start: Math.max(s.start, start), end: Math.min(s.end, end) })),
    },
    holds: {
      place: async (h: { expiresAt: number }) => {
        await pause();
        if (state.holdFails) throw Object.assign(new Error("span is already allocated"), { code: "40001" });
        const id = `hold${state.holds.length + 1}`;
        state.holds.push(id);
        return { id, expiresAt: h.expiresAt };
      },
      commit: async (holdId: string, opts?: { label?: string }) => {
        await pause();
        if (state.commitFails) throw new Error("hold expired");
        const booking = { id: `booking${state.bookings.length + 1}`, label: opts?.label };
        state.bookings.push(booking);
        return { bookingId: booking.id, holdId };
      },
      release: async (holdId: string) => {
        state.released.push(holdId);
      },
    },
    bookings: {
      cancel: async (id: string) => {
        state.cancelled.push(id);
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
  const service = createMeetingService({
    dt,
    registry,
    store,
    notify: async (n) => {
      notices.push(n);
    },
    reviewBase: opts.reviewBase ?? null,
    now: () => clock.now,
  });
  const ask = (overrides: Partial<Parameters<typeof service.request>[0]> = {}) =>
    service.request({ calendarId: "cal1", requester: ANNA, contact: annaContact, start: T, end: T + 30 * MIN, ...overrides });
  return { registry, store, service, state, notices, clock, dt, ask };
}
