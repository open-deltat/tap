import { dtPublic } from "./deltat";
import { publicRegistry } from "./public-registry";
import { openBookingPassStore } from "./booking-passes";
import { createBookingPassService, type BookingPassService } from "./booking-pass-service";
import { createRateLimiter } from "./rate-limit";

// The one process-wide booking-pass service, beside the registry it reads (public-registry.ts) and
// on the same data volume: the same single-container limit applies, and more so here, because the
// spend lock that keeps a pass from booking twice lives in this process. Kept on globalThis for the
// reason the registry is: a second module graph must not hold its own copy and spend a pass again.
const shared = globalThis as typeof globalThis & { __deltatBookingPasses?: BookingPassService };

/** A pass takes a handful of calls to use; this bounds a caller presenting passes, real or guessed. */
const PASS_LOOKUPS_PER_HOUR = 120;

export const bookingPasses: BookingPassService = (shared.__deltatBookingPasses ??= createBookingPassService({
  dt: dtPublic,
  registry: publicRegistry,
  store: openBookingPassStore(process.env.BOOKING_PASSES_PATH?.trim() || "./data/booking-passes.json"),
  lookups: createRateLimiter({ limit: PASS_LOOKUPS_PER_HOUR, windowMs: 3_600_000 }),
}));
