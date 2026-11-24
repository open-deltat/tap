import { dt } from "@open-deltat/examples/lib/deltat";
import { ensureOpenWindow, findRootByName } from "@open-deltat/examples/actions/seed-helpers";
import { trackBookings } from "@open-deltat/examples/lib/session-bookings";
import { createRateLimiter } from "@open-deltat/examples/lib/rate-limit";
import { getSessionId } from "@open-deltat/examples/lib/session";
import { callerIp } from "@open-deltat/examples/lib/caller";
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

const HOUR_MS = 60 * 60_000;

// Each calendar is found (or created) by name and its one open window widened, once an hour, with
// concurrent callers sharing that one lookup: two first visitors create one calendar, and the hot
// path costs nothing. A failed tool call drops the entry (forgetCalendar), so a reset demo tenant
// heals on the next press rather than at the next hour.
const ready = new Map<ToolCalendar, { at: number; id: Promise<string> }>();

async function prepare(name: string): Promise<string> {
  const id = (await findRootByName(name)) ?? (await dt.resources.create({ name })).id;
  // One always-open rule, widened in place, rather than a 24-hour rule per day.
  await ensureOpenWindow(id);
  return id;
}

export async function toolCalendar(which: ToolCalendar): Promise<string> {
  const cached = ready.get(which);
  if (cached && Date.now() - cached.at < HOUR_MS) return cached.id;
  const id = prepare(TOOL_CALENDARS[which]).catch((err: unknown) => {
    ready.delete(which);
    throw err;
  });
  ready.set(which, { at: Date.now(), id });
  return id;
}

export function forgetCalendar(which: ToolCalendar): void {
  ready.delete(which);
}

// Strangers can press these buttons as fast as they like, and each press is real writes to Δt.
// Keyed by address, as the public booking actions are, because the visitor cookie is the caller's
// to drop. The site-wide cap bounds everyone together, and is only charged once a caller is within
// their own limit, so one caller hammering away cannot use up everyone's hour.
const perCaller = createRateLimiter({ limit: 30, windowMs: 60_000 });
const siteWide = createRateLimiter({ limit: 6_000, windowMs: HOUR_MS });

export type Gate = { ok: true; sid: string | null } | { ok: false; message: string };

export async function gate(): Promise<Gate> {
  const caller = perCaller.check(await callerIp());
  const site = caller.allowed ? siteWide.check("site") : null;
  if (site?.allowed) return { ok: true, sid: await getSessionId() };
  const wait = Math.ceil((site ? site.retryAfterMs : caller.retryAfterMs) / 1000);
  return { ok: false, message: `Too many tries right now. Wait ${wait} seconds and run it again.` };
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
