import { openBookingPassStore } from "../booking-passes";
import { createBookingPassService } from "../booking-pass-service";
import { createRateLimiter } from "../rate-limit";
import type { Notifier } from "../notify";
import { createMyCalendars } from "../my-calendars";
import { BEN, MIN, OWNER, T, setupMeetings, tmpPath } from "./meeting-fixtures";

/** The public origin the fixtures' booking links are built from. */
export const BOOKING_BASE = "https://delt.at";

// Shared by the booking-pass tests: the meeting fixture's calendar ("cal1", owned by OWNER, which
// takes requests), a second calendar owned by BEN, and a pass service over the same fake deltat and
// clock, so the endpoint tests can serve meetings and passes from one server.

export const GUEST = "https://issuer.test#guest";
export const STRANGER = "https://issuer.test#stranger";

/** Owner notices from both services land in the meeting fixture's `notices`, unless a test swaps the notifier. */
export function setupPasses(opts: { lookupLimit?: number; notify?: Notifier } = {}) {
  const meetings = setupMeetings();
  meetings.registry.register({ id: "cal2", name: "Ben's week", slotMinutes: 60, timezone: "UTC", owner: BEN });
  meetings.state.resources.set("cal2", { id: "cal2", parentId: null, name: "Ben's week", capacity: 1, bufferAfter: null });
  const calendars = createMyCalendars({ dt: meetings.dt, registry: meetings.registry, bookingBase: BOOKING_BASE });
  const storePath = tmpPath(`passes_${crypto.randomUUID()}`);
  const store = openBookingPassStore(storePath, { now: () => meetings.clock.now });
  const passes = createBookingPassService({
    dt: meetings.dt,
    registry: meetings.registry,
    store,
    lookups: createRateLimiter({ limit: opts.lookupLimit ?? 1_000, windowMs: 3_600_000, now: () => meetings.clock.now }),
    notify:
      opts.notify ??
      (async (n) => {
        meetings.notices.push(n);
      }),
    now: () => meetings.clock.now,
  });
  /** A pass on cal1 for [T, T + 4h), with the service's defaults unless overridden. */
  const mint = (overrides: Partial<Parameters<typeof passes.create>[0]> = {}) => {
    const made = passes.create({ owner: OWNER, calendarId: "cal1", from: T, to: T + 240 * MIN, ...overrides });
    if (!made.ok) throw new Error(made.error);
    return made.value;
  };
  return { ...meetings, passes, calendars, store, storePath, mint };
}
