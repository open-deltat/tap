import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DeltaT, expandRecurrence, counterOffer, sqlstateOf } from "@open-deltat/client";
import type { CounterOffer } from "@open-deltat/client";

// The agent-facing tool surface over deltat: create a calendar, set its availability, then the
// real-time booking loop (find, hold, commit, release) plus read and cancel. Times cross this
// boundary as RFC 3339 strings, never bare epoch milliseconds (agents hallucinate integers); the
// server converts. Errors come back as a typed code an agent can branch on.

/**
 * Reported to clients in the MCP initialize handshake. `rootDir: "src"` rules out importing
 * package.json without breaking the dist layout, so this is stated once here and a test asserts it
 * still matches package.json rather than letting the two drift silently.
 */
export const VERSION = "0.1.0";

const DAY = 86_400_000;
const HORIZON_DAYS = 60;
const HOLD_TTL_MS = 5 * 60_000; // long enough to check with a human before committing

// RFC 3339 with a mandatory offset (Z or ±HH:MM). Enforced because a zoneless datetime is
// interpreted in the host's local zone by Date.parse, so the same agent input would book a
// different absolute instant depending on where the process runs. A strict shape also rejects the
// non-RFC-3339 forms Date.parse leniently accepts.
const RFC3339 = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}(:\d{2})?(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;

const toMs = (iso: string): number => {
  if (!RFC3339.test(iso)) {
    throw new ToolError("INVALID", `Not an RFC 3339 timestamp with an offset (e.g. 2026-06-01T09:00:00Z): ${iso}`);
  }
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new ToolError("INVALID", `Unparseable timestamp: ${iso}`);
  return ms;
};
const toIso = (ms: number): string => new Date(ms).toISOString();
const local = (ms: number, tz: string): string => {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(ms);
  } catch {
    return toIso(ms);
  }
};

class ToolError extends Error {
  constructor(
    readonly code: "CONFLICT" | "EXPIRED" | "INVALID" | "NOT_FOUND" | "INTERNAL",
    message: string,
    /** Times the caller could take instead, when the kernel supplied any. */
    readonly offer?: CounterOffer
  ) {
    super(message);
  }
}

/**
 * Map a deltat/pg error to the agent-facing typed code.
 *
 * SQLSTATE first, message text only as a fallback for kernels older than the taxonomy. Matching on
 * prose was how `ClosedBySchedule` ("span is outside open windows or blocked") ended up reported as
 * INTERNAL: it matched none of the four patterns, so a request merely outside opening hours told
 * the model that retrying would not help, and the model abandoned a booking it could have made by
 * asking for a different time.
 *
 * The default stays INTERNAL rather than INVALID. INVALID tells a model its arguments were wrong,
 * which invites a retry; for a fault unrelated to the arguments that is an infinite loop, and on
 * `hold_slot` each pass leaves a live hold blocking the slot until the reaper expires it.
 */
function classify(err: unknown): ToolError {
  // An error that already carries a code was classified at the throw site, which knew more than
  // any message-text match can recover. Re-deriving it here is how a precise "that timestamp has
  // no offset" got downgraded to an unhelpful INTERNAL.
  if (err instanceof ToolError) return err;

  const msg = err instanceof Error ? err.message : String(err);
  const offer = counterOffer(err) ?? undefined;

  // Before the SQLSTATE switch, not after. A hold that lapsed mid-conversation surfaces as 42704
  // (unknown id), and reporting that as NOT_FOUND would tell the model it had the wrong calendar
  // when the truth is that its hold expired and it should place a new one.
  if (/expired|no longer exists|unknown hold/i.test(msg)) {
    return new ToolError("EXPIRED", msg, offer);
  }

  switch (sqlstateOf(err)) {
    // Lost a race, or the resource filled. Both mean "not this time", and both now carry the
    // times that do work.
    case "40001":
      return new ToolError("CONFLICT", msg, offer);
    // Outside open hours or outside the parent's availability. Not a race, so retrying the same
    // span is pointless, but it is exactly where alternatives are most useful.
    case "23514":
      return new ToolError("CONFLICT", msg, offer);
    case "42704":
      return new ToolError("NOT_FOUND", msg, offer);
    case "23505": // reused id
    case "54000": // limit exceeded
      return new ToolError("INVALID", msg, offer);
    case "58030": // WAL / storage fault
      return new ToolError("INTERNAL", msg, offer);
  }

  // Fallback for a kernel that predates real SQLSTATEs, or a non-deltat error.
  if (/conflict|overlap|already|capacity|outside open|blocked/i.test(msg)) {
    return new ToolError("CONFLICT", msg, offer);
  }
  if (/not found|unknown resource|no such/i.test(msg)) return new ToolError("NOT_FOUND", msg, offer);
  if (/invalid|malformed|out of range|must be|cannot parse|unsupported/i.test(msg)) {
    return new ToolError("INVALID", msg, offer);
  }
  return new ToolError(
    "INTERNAL",
    `${msg} (this is a server or configuration fault, not a problem with your arguments; retrying the same call will not help)`
  );
}

const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
/**
 * Render a refusal for a model.
 *
 * Without alternatives this is the plain `CODE: message` string it has always been, which keeps the
 * shape stable against a kernel that has counter-offers switched off or predates them. With
 * alternatives it becomes JSON in the same voice as the `book_slot` refusal, because the model is
 * about to read these times out loud and needs the local rendering plus an unmissable statement
 * that none of them is held.
 */
const fail = (e: ToolError, timezone = "UTC") => {
  if (!e.offer || e.offer.alternatives.length === 0) {
    // An unscheduled calendar is worth saying out loud: it has no opening hours to list, but it
    // still takes bookings, so "no alternatives" must not read as "no availability".
    if (e.offer?.schedule === "unscheduled") {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: e.code,
              message: e.message,
              booked: false,
              held: false,
              reserved: false,
              schedule: "unscheduled",
              next: "This calendar publishes no opening hours, so there is no list of free times to offer. It still accepts bookings: pick another time and call hold_slot.",
            }),
          },
        ],
        isError: true,
      };
    }
    return {
      content: [{ type: "text" as const, text: `${e.code}: ${e.message}` }],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error: e.code,
          message: e.message,
          // The triple exists so a model that skims to `alternatives` cannot narrate
          // "I moved you to 4pm". Nothing happened, and nothing is being kept for it.
          booked: false,
          held: false,
          reserved: false,
          retry_same_time: e.offer.retrySameSpan,
          alternatives: e.offer.alternatives.map((a) => ({
            start: toIso(a.start),
            end: toIso(a.end),
            start_local: local(a.start, timezone),
          })),
          next: "These times were free a moment ago but are NOT reserved. Offer one, then call hold_slot on it before you tell anyone it is theirs.",
        }),
      },
    ],
    isError: true,
  };
};

const HOURS_SHAPE = z
  .array(
    z.object({
      day: z.number().int().min(0).max(6).describe("0=Sunday … 6=Saturday"),
      start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).describe("local open time, HH:MM"),
      end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).describe("local close time, HH:MM"),
    })
  )
  .describe("Weekly open hours; empty means no availability");

/** Calendar date (YYYY-MM-DD) in the given zone; en-CA renders exactly that shape. */
const dateStr = (ms: number, tz: string): string => {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
};

async function applyHours(
  dt: DeltaT,
  calendarId: string,
  timezone: string,
  hours: { day: number; start: string; end: string }[]
): Promise<number> {
  const now = Date.now();
  const segments = hours.flatMap((h) =>
    expandRecurrence({
      daysOfWeek: [h.day],
      startTime: h.start,
      endTime: h.end,
      fromDate: dateStr(now, timezone),
      toDate: dateStr(now + HORIZON_DAYS * DAY, timezone),
      timeZone: timezone,
      blocking: false,
    })
  );
  await dt.rules.replaceOpenHours(calendarId, segments.map((s) => ({ start: s.start, end: s.end })));
  return segments.length;
}

/**
 * Build the MCP server over a connected DeltaT client. Exposed for embedding and for tests; the
 * stdio entry point wires the transport.
 */
export function createDeltatMcpServer(dt: DeltaT): McpServer {
  const server = new McpServer(
    { name: "deltat", version: VERSION },
    {
      instructions: [
        "Create a real-time calendar and let anyone, or any agent, book time on it.",
        "",
        "There is no one-step booking verb, on purpose. Booking is always three calls:",
        "  1. find_slots  - what is actually free",
        "  2. hold_slot   - reserve one before you offer it to anyone, returns a hold_id",
        "  3. commit_hold - confirm it atomically",
        "",
        "The reason is that a free slot you read a second ago may already be gone. Two callers can",
        "check the same slot at the same moment and both believe they won it. The hold is what makes",
        "the confirmation safe: between step 2 and step 3 the slot is yours and nobody else can take",
        "it. Holds expire on their own after a few minutes, so holding one costs nothing and you do",
        "not need to clean up after an abandoned conversation. Release early with release_hold when",
        "you know the time is not wanted.",
        "",
        "When a hold or a commit is refused, the reply usually lists other times that were free at",
        "that moment. Offer one of those straight away rather than starting over with find_slots.",
        "They are NOT reserved for you: whoever accepts one, you still have to hold_slot it.",
        "",
        "Never tell a human a time is booked until commit_hold has returned. find_slots and hold_slot",
        "are both reversible; only commit_hold is a commitment.",
      ].join("\n"),
    }
  );

  server.registerTool(
    "create_calendar",
    {
      title: "Create a calendar",
      description:
        "Use this when someone needs a new bookable calendar and you do not already have a calendar_id. Returns the calendar_id every other tool needs. Pass `hours` to open it for business in the same call; without them the calendar exists but nothing can be booked on it yet.",
      inputSchema: {
        name: z.string().min(1).max(60),
        timezone: z.string().default("UTC").describe("IANA timezone, e.g. Europe/Berlin"),
        slot_minutes: z.number().int().refine((n) => [15, 30, 60, 90, 120].includes(n)).default(30),
        hours: HOURS_SHAPE.optional(),
      },
    },
    async ({ name, timezone, slot_minutes, hours }) => {
      try {
        const resource = await dt.resources.create({ name });
        let openSegments = 0;
        if (hours?.length) openSegments = await applyHours(dt, resource.id, timezone, hours);
        return ok(
          JSON.stringify({
            calendar_id: resource.id,
            name,
            timezone,
            slot_minutes,
            open_segments: openSegments,
            note: openSegments === 0 ? "No availability yet; call set_availability." : "Ready to book.",
          })
        );
      } catch (e) {
        return fail(classify(e));
      }
    }
  );

  server.registerTool(
    "set_availability",
    {
      title: "Set availability",
      description:
        "Use this when a calendar's opening hours need to change, or when find_slots returns nothing because none were set. Replaces the whole weekly schedule rather than adding to it, so send every open block you want, not just the new one. Existing bookings are kept even if they now fall outside open hours.",
      inputSchema: { calendar_id: z.string(), timezone: z.string().default("UTC"), hours: HOURS_SHAPE },
    },
    async ({ calendar_id, timezone, hours }) => {
      try {
        const n = await applyHours(dt, calendar_id, timezone, hours);
        return ok(JSON.stringify({ calendar_id, open_segments: n }));
      } catch (e) {
        return fail(classify(e));
      }
    }
  );

  server.registerTool(
    "find_slots",
    {
      title: "Find open slots",
      description:
        "Use this first, before offering anyone a time. Lists the genuinely free slots on a calendar between two RFC 3339 instants (offset required, e.g. 2026-06-01T09:00:00Z). A slot listed here is not reserved for you: another caller can take it a moment later, so call hold_slot before you promise it to anyone. Availability is materialized about 60 days ahead, so searching further out returns nothing rather than an error.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: {
        calendar_id: z.string(),
        from: z.string().describe("RFC 3339 start of the search window"),
        to: z.string().describe("RFC 3339 end of the search window"),
        timezone: z.string().default("UTC"),
        min_minutes: z.number().int().positive().optional(),
      },
    },
    async ({ calendar_id, from, to, timezone, min_minutes }) => {
      try {
        const slots = await dt.availability.get({
          resourceId: calendar_id,
          start: toMs(from),
          end: toMs(to),
          minDuration: min_minutes ? min_minutes * 60_000 : undefined,
        });
        return ok(
          JSON.stringify({
            calendar_id,
            slots: slots.map((s) => ({
              start: toIso(s.start),
              end: toIso(s.end),
              start_local: local(s.start, timezone),
            })),
          })
        );
      } catch (e) {
        return fail(classify(e));
      }
    }
  );

  server.registerTool(
    "hold_slot",
    {
      title: "Hold a slot",
      description:
        "Use this the moment you are about to offer a specific time to a human, before you say it out loud. Reserves the slot for a few minutes so nobody else can take it while you confirm, and returns a hold_id. A hold is not a booking: call commit_hold to confirm it, or release_hold to give it back. If you do neither it expires on its own and the slot returns to the pool, so holding costs nothing. If the time is already taken or outside opening hours, the refusal lists other free times: offer one of those in the same breath rather than calling find_slots again. They are not reserved for you, so call hold_slot on whichever one is chosen.",
      inputSchema: {
        calendar_id: z.string(),
        start: z.string().describe("RFC 3339"),
        end: z.string().describe("RFC 3339"),
        timezone: z.string().default("UTC"),
      },
    },
    async ({ calendar_id, start, end, timezone }) => {
      try {
        const expiresAt = Date.now() + HOLD_TTL_MS;
        const hold = await dt.holds.place({ resourceId: calendar_id, start: toMs(start), end: toMs(end), expiresAt });
        // Read the authoritative server-assigned expiry back.
        const live = (await dt.holds.get(calendar_id)).find((h) => h.id === hold.id);
        const exp = live?.expiresAt ?? expiresAt;
        return ok(
          JSON.stringify({
            hold_id: hold.id,
            expires_at: toIso(exp),
            expires_at_local: local(exp, timezone),
            next: "Call commit_hold with this hold_id to confirm, or release_hold to let it go.",
          })
        );
      } catch (e) {
        // The caller's timezone matters most here: a refused hold is the moment the model is about
        // to say a time out loud, so the alternatives need local rendering.
        return fail(classify(e), timezone);
      }
    }
  );

  // Every other calendar API in a model's training data has a single book/create verb, so a model
  // reaches for one here and, finding nothing, either invents arguments for a tool that does not
  // exist or gives up mid-conversation. Registering the verb and having it refuse turns that dead
  // end into an instruction: the model reads the refusal and retries correctly in the same turn.
  // It never books, because a booking that skipped the hold is exactly the race this product exists
  // to prevent. See PRINCIPLES.md, "never return a dead end".
  server.registerTool(
    "book_slot",
    {
      title: "Book a slot (not supported; use hold then commit)",
      description:
        "Use this when you were about to book a slot in one step. This calendar does not have a one-step booking verb, and calling this tool never books anything. Booking is two steps so a confirmation cannot lose a race: call hold_slot to reserve the time, then commit_hold to confirm it. This tool exists only to tell you that.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: {
        calendar_id: z.string().optional(),
        start: z.string().optional().describe("RFC 3339"),
        end: z.string().optional().describe("RFC 3339"),
      },
    },
    async ({ calendar_id, start, end }) =>
      fail(
        new ToolError(
          "INVALID",
          JSON.stringify({
            booked: false,
            reason: "There is no one-step booking verb. Nothing was booked or reserved by this call.",
            do_this_instead: [
              { step: 1, tool: "hold_slot", args: { calendar_id, start, end }, note: "reserves the slot for a few minutes" },
              { step: 2, tool: "commit_hold", args: { hold_id: "<from step 1>" }, note: "confirms it atomically" },
            ],
            why: "Two callers can check the same free slot at the same moment and both believe they won it. A hold is the reservation that makes the confirmation safe.",
          })
        )
      )
  );

  server.registerTool(
    "commit_hold",
    {
      title: "Commit a hold",
      description:
        "Use this when you have a hold_id from hold_slot and the booking is confirmed. Turns the hold into a booking in one atomic step, so the slot cannot be lost between reserving and confirming. This is the only way to create a booking. If it is refused, the reply may list other free times: offer one and call hold_slot on it, since none of them is reserved for you.",
      inputSchema: {
        hold_id: z.string(),
        label: z.string().max(200).optional().describe("who the booking is for"),
        timezone: z.string().default("UTC").describe("IANA timezone for rendering any alternative times"),
      },
    },
    async ({ hold_id, label, timezone }) => {
      try {
        const { bookingId } = await dt.holds.commit(hold_id, label ? { label } : undefined);
        return ok(JSON.stringify({ booking_id: bookingId, status: "confirmed" }));
      } catch (e) {
        return fail(classify(e), timezone);
      }
    }
  );

  server.registerTool(
    "release_hold",
    {
      title: "Release a hold",
      description:
        "Use this as soon as you know a held time is not wanted, for example the person picked a different slot or ended the conversation. Frees the slot immediately instead of leaving it blocked until the hold expires. Safe to call on a hold that already expired.",
      inputSchema: { hold_id: z.string() },
    },
    async ({ hold_id }) => {
      try {
        await dt.holds.release(hold_id);
        return ok(JSON.stringify({ hold_id, status: "released" }));
      } catch (e) {
        return fail(classify(e));
      }
    }
  );

  server.registerTool(
    "list_bookings",
    {
      title: "List bookings",
      description:
        "Use this when someone asks what is already scheduled, or when you need a booking_id in order to cancel something. Returns confirmed bookings only; slots that are merely held do not appear here. To find free time instead, use find_slots.",
      annotations: { readOnlyHint: true },
      inputSchema: { calendar_id: z.string(), timezone: z.string().default("UTC") },
    },
    async ({ calendar_id, timezone }) => {
      try {
        const bookings = await dt.bookings.get(calendar_id);
        return ok(
          JSON.stringify({
            calendar_id,
            bookings: bookings.map((b) => ({
              booking_id: b.id,
              start: toIso(b.start),
              end: toIso(b.end),
              start_local: local(b.start, timezone),
              label: b.label,
            })),
          })
        );
      } catch (e) {
        return fail(classify(e));
      }
    }
  );

  server.registerTool(
    "cancel_booking",
    {
      title: "Cancel a booking",
      description:
        "Use this only when a human has asked for a confirmed booking to be cancelled. Permanently removes it and frees the slot for anyone else. Needs a booking_id from list_bookings or commit_hold, not a hold_id. To give up a slot you are only holding, use release_hold instead.",
      annotations: { destructiveHint: true },
      inputSchema: { booking_id: z.string() },
    },
    async ({ booking_id }) => {
      try {
        await dt.bookings.cancel(booking_id);
        return ok(JSON.stringify({ booking_id, status: "cancelled" }));
      } catch (e) {
        return fail(classify(e));
      }
    }
  );

  return server;
}
