import { dt } from "@open-deltat/examples/lib/deltat";
import { daily, ensureSchedule, findRootByName } from "@open-deltat/examples/actions/seed-helpers";
import { trackBookings } from "@open-deltat/examples/lib/session-bookings";
import { createRateLimiter } from "@open-deltat/examples/lib/rate-limit";
import { getSessionId } from "@open-deltat/examples/lib/session";
import { classifyRefusal, type Booking } from "@open-deltat/client";

// Server-side plumbing the live tools share. Each tool books on its own calendar in the demo tenant
// (never the public one, where real people's calendars live), so a visitor on the race cannot fill
// the console's slots, and nothing here touches the curated examples.

/** The calendars the live tools book on. Open around the clock, so a visitor at any hour sees free time. */
export const TOOL_CALENDARS = {
  console: "Booking API console",
  race: "Double-booking race",
  agent: "Agent booking desk",
} as const;

export type ToolCalendar = keyof typeof TOOL_CALENDARS;

const ALWAYS_OPEN = daily([{ h: 0, m: 0, dur: 1440 }]);

// One creation per calendar per process: two first visitors at once would otherwise both find no
// root and both create one. A failed attempt is dropped so the next call tries again.
const roots = new Map<ToolCalendar, Promise<string>>();

async function createOrFind(name: string): Promise<string> {
  return (await findRootByName(name)) ?? (await dt.resources.create({ name })).id;
}

export async function toolCalendar(which: ToolCalendar): Promise<string> {
  const cached = roots.get(which) ?? createOrFind(TOOL_CALENDARS[which]);
  roots.set(which, cached);
  const id = await cached.catch((err: unknown) => {
    roots.delete(which);
    throw err;
  });
  // Every call, not once: the open hours roll forward with the calendar date (see ensureSchedule).
  await ensureSchedule(id, ALWAYS_OPEN);
  return id;
}

// Strangers can press these buttons as fast as they like, and each press is real writes to Δt.
// Per visitor, a generous budget for a person and a wall for a script.
const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

export type Gate = { ok: true; sid: string | null } | { ok: false; message: string };

export async function gate(): Promise<Gate> {
  const sid = await getSessionId();
  const verdict = limiter.check(sid ?? "anonymous");
  if (verdict.allowed) return { ok: true, sid };
  return { ok: false, message: `Too many tries. Wait ${Math.ceil(verdict.retryAfterMs / 1000)} seconds and run it again.` };
}

/** Bookings the tools make clear themselves after a short while, like every demo booking. */
export function forgetLater(sid: string | null, bookings: Booking[]): void {
  trackBookings(sid ?? "tools", bookings, Date.now());
}

/** The SDK's own refusal reading: the same code and alternatives the MCP server and CLI report. */
export function refusal(err: unknown): { code: string; reply: unknown } {
  const r = classifyRefusal(err);
  return {
    code: r.code,
    reply: {
      code: r.code,
      message: r.message,
      ...(r.offer ? { alternatives: r.offer.alternatives, retrySameSpan: r.offer.retrySameSpan } : {}),
    },
  };
}

export const HALF_HOUR = 30 * 60_000;

/** The next half-hour boundary at least `leadMs` from now: a time a person could still book. */
export function nextHalfHour(now: number, leadMs = 0): number {
  return Math.ceil((now + leadMs) / HALF_HOUR) * HALF_HOUR;
}
