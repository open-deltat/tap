import { dt } from "@open-deltat/examples/lib/deltat";
import { daily, ensureSchedule, findRootByName } from "@open-deltat/examples/actions/seed-helpers";
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

const ALWAYS_OPEN = daily([{ h: 0, m: 0, dur: 1440 }]);

const HOUR_MS = 60 * 60_000;

// The calendar is looked up by name on every call, never cached by id, so a deleted or reset demo
// tenant heals on the next press instead of failing until a restart. In-flight lookups are shared,
// so two first visitors at once create one calendar, not two.
const lookups = new Map<ToolCalendar, Promise<string>>();
// Open hours are topped up at most hourly per calendar, and concurrent callers share one top-up, so
// two presses cannot both lay down the same missing days (ensureSchedule reads, then writes).
const toppedUp = new Map<string, { at: number; done: Promise<unknown> }>();

async function findOrCreate(name: string): Promise<string> {
  return (await findRootByName(name)) ?? (await dt.resources.create({ name })).id;
}

export async function toolCalendar(which: ToolCalendar): Promise<string> {
  const pending = lookups.get(which) ?? findOrCreate(TOOL_CALENDARS[which]).finally(() => lookups.delete(which));
  lookups.set(which, pending);
  const id = await pending;
  const last = toppedUp.get(id);
  if (!last || Date.now() - last.at > HOUR_MS) {
    const done = ensureSchedule(id, ALWAYS_OPEN).catch((err: unknown) => {
      toppedUp.delete(id);
      throw err;
    });
    toppedUp.set(id, { at: Date.now(), done });
  }
  await toppedUp.get(id)?.done;
  return id;
}

// Strangers can press these buttons as fast as they like, and each press is real writes to Δt.
// Keyed by address, as the public booking actions are, because the visitor cookie is the caller's
// to drop; a site-wide cap bounds everyone together.
const perCaller = createRateLimiter({ limit: 30, windowMs: 60_000 });
const siteWide = createRateLimiter({ limit: 1_500, windowMs: HOUR_MS });

export type Gate = { ok: true; sid: string | null } | { ok: false; message: string };

export async function gate(): Promise<Gate> {
  const caller = perCaller.check(await callerIp());
  const site = siteWide.check("site");
  if (caller.allowed && site.allowed) return { ok: true, sid: await getSessionId() };
  const wait = Math.ceil(Math.max(caller.retryAfterMs, site.retryAfterMs) / 1000);
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
