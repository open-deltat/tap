import { dtPublic } from "./deltat";
import { publicRegistry } from "./public-registry";
import { publicBaseUrl } from "./public-base-url";
import { createMyCalendars, type MyCalendarsService } from "./my-calendars";

// The one process-wide calendar service for the hosted MCP, beside the registry it writes. Kept on
// globalThis like the registry: the per-owner cap counts creates in flight in memory, and a second
// module graph with its own count would let a burst of creates past the cap.
const shared = globalThis as typeof globalThis & { __deltatMyCalendars?: MyCalendarsService };

export const myCalendars: MyCalendarsService = (shared.__deltatMyCalendars ??= createMyCalendars({
  dt: dtPublic,
  registry: publicRegistry,
  bookingBase: publicBaseUrl,
}));
