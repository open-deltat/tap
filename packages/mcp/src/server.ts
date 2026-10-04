import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DeltaT, expandRecurrence, classifyRefusal, parseInstant, sqlstateOf } from "@open-deltat/client";
import type { CounterOffer, RefusalCode } from "@open-deltat/client";

// The agent-facing tool surface over deltat: create a calendar, set its availability, then the
// real-time booking loop (find, hold, commit, release) plus read and cancel. Times cross this
// boundary as RFC 3339 strings, never bare epoch milliseconds (agents hallucinate integers); the
// server converts. Errors come back as a typed code an agent can branch on.

/**
 * Reported to clients in the MCP initialize handshake. `rootDir: "src"` rules out importing
 * package.json without breaking the dist layout, so this is stated once here and a test asserts it
 * still matches package.json rather than letting the two drift silently.
 */
export const VERSION = "0.2.0";

const DAY = 86_400_000;
const HORIZON_DAYS = 60;
const HOLD_TTL_MS = 5 * 60_000; // long enough to check with a human before committing
// What deltat offers after a refused single calendar (COUNTER_OFFER_WINDOW_MS and COUNTER_OFFER_MAX
// in its limits.rs), so a refused kit reads the same as a refused calendar.
const OFFER_WINDOW_MS = 7 * DAY;
const OFFER_MAX = 3;

const CALENDAR_IDS = z
  .array(z.string())
  .min(1)
  .describe("One calendar_id, or several to book together at the same time (a person and a room, a camera and its crew)");
const HOLD_IDS = z.array(z.string()).min(1).describe("Every hold_id that hold_slot returned");

// Strict RFC 3339 with an offset; parseInstant says why a zoneless time is refused.
const toMs = (iso: string): number => {
  const parsed = parseInstant(iso);
  if (!parsed.ok) throw new ToolError("INVALID", parsed.message);
  return parsed.ms;
};
const toIso = (ms: number): string => new Date(ms).toISOString();
const local = (ms: number, tz: string): string => {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(ms);
  } catch {
    return toIso(ms);
  }
};

/** The part of a counter-offer an agent is shown. */
type Offer = Pick<CounterOffer, "alternatives" | "retrySameSpan" | "schedule">;

class ToolError extends Error {
  constructor(
    readonly code: RefusalCode,
    message: string,
    /** Times the caller could take instead, from the kernel or, for a kit, from find_slots' query. */
    readonly offer?: Offer
  ) {
    super(message);
  }
}

/** Map a deltat/pg error to the agent-facing typed code. The mapping and its reasons live in the SDK. */
function classify(err: unknown): ToolError {
  // An error that already carries a code was classified at the throw site, which knew more than
  // any message-text match can recover. Re-deriving it here is how a precise "that timestamp has
  // no offset" got downgraded to an unhelpful INTERNAL.
  if (err instanceof ToolError) return err;
  const refusal = classifyRefusal(err);
  return new ToolError(refusal.code, refusal.message, refusal.offer ?? undefined);
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
 * A refused kit, with times that would work. deltat offers alternatives for one calendar but not for
 * several, because what fits every calendar at once is a joint question its per-calendar sweep does
 * not answer. find_slots' own query answers it: the earliest free stretches long enough for the same
 * span, in the week after the requested start, never the span just refused. Like deltat's own
 * offers, none of them is held.
 */
async function withKitAlternatives(
  dt: DeltaT,
  refused: unknown,
  calendarIds: readonly string[],
  span: { start: number; end: number }
): Promise<ToolError> {
  const error = classify(refused);
  if (calendarIds.length < 2 || error.code !== "CONFLICT") return error;
  const length = span.end - span.start;
  const free = await dt.availability
    .getCombined({ resourceIds: [...calendarIds], start: span.start, end: span.start + OFFER_WINDOW_MS, minDuration: length })
    .catch(() => []);
  const alternatives = free
    .filter((s) => s.start !== span.start)
    .slice(0, OFFER_MAX)
    .map((s) => ({ start: s.start, end: s.start + length }));
  // 23514 is outside opening hours, which waiting will not change.
  const retrySameSpan = sqlstateOf(refused) !== "23514";
  return new ToolError(error.code, error.message, { alternatives, retrySameSpan, schedule: "known" });
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
        "  2. hold_slot   - reserve one before you offer it to anyone, returns hold_ids",
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
        "",
        "To book several calendars together (a person and a room, a camera and its crew), pass all of",
        "their ids to the same three tools: find_slots returns only times when every one is free,",
        "hold_slot holds every one or none, and commit_hold books every hold or none. Nobody can end",
        "up with half of it.",
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
        "Use this first, before offering anyone a time. Lists the genuinely free slots between two RFC 3339 instants (offset required, e.g. 2026-06-01T09:00:00Z). With several calendars it lists only the times when every one of them is free. A slot listed here is not reserved for you: another caller can take it a moment later, so call hold_slot before you promise it to anyone. Availability is materialized about 60 days ahead, so searching further out returns nothing rather than an error.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: {
        calendar_ids: CALENDAR_IDS,
        from: z.string().describe("RFC 3339 start of the search window"),
        to: z.string().describe("RFC 3339 end of the search window"),
        timezone: z.string().default("UTC"),
        min_minutes: z.number().int().positive().optional(),
      },
    },
    async ({ calendar_ids, from, to, timezone, min_minutes }) => {
      try {
        const slots = await dt.availability.getCombined({
          resourceIds: calendar_ids,
          start: toMs(from),
          end: toMs(to),
          minDuration: min_minutes ? min_minutes * 60_000 : undefined,
        });
        return ok(
          JSON.stringify({
            calendar_ids,
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
        "Use this the moment you are about to offer a specific time to a human, before you say it out loud. Reserves the slot for a few minutes so nobody else can take it while you confirm, and returns hold_ids. With several calendars it holds every one of them for the same time, or none. A hold is not a booking: call commit_hold to confirm it, or release_hold to give it back. If you do neither it expires on its own and the slot returns to the pool, so holding costs nothing. If the time is already taken or outside opening hours, the refusal lists other free times: offer one of those in the same breath rather than calling find_slots again. They are not reserved for you, so call hold_slot on whichever one is chosen.",
      inputSchema: {
        calendar_ids: CALENDAR_IDS,
        start: z.string().describe("RFC 3339"),
        end: z.string().describe("RFC 3339"),
        timezone: z.string().default("UTC"),
      },
    },
    async ({ calendar_ids, start, end, timezone }) => {
      try {
        const span = { start: toMs(start), end: toMs(end) };
        const expiresAt = Date.now() + HOLD_TTL_MS;
        const held = await dt.holds
          .placeMany(calendar_ids.map((resourceId) => ({ resourceId, ...span, expiresAt })))
          .catch(async (e) => {
            throw await withKitAlternatives(dt, e, calendar_ids, span);
          });
        // Read the authoritative server-assigned expiries back. The holds stand or fall together, so
        // what the agent needs is the earliest of them.
        const live = await dt.holds.getMany(calendar_ids);
        const exp = Math.min(...held.map((h) => live[h.resourceId]?.find((l) => l.id === h.id)?.expiresAt ?? h.expiresAt));
        return ok(
          JSON.stringify({
            hold_ids: held.map((h) => h.id),
            expires_at: toIso(exp),
            expires_at_local: local(exp, timezone),
            next: "Call commit_hold with these hold_ids to confirm, or release_hold to let them go.",
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
              {
                step: 1,
                tool: "hold_slot",
                args: { calendar_ids: calendar_id ? [calendar_id] : undefined, start, end },
                note: "reserves the slot for a few minutes",
              },
              { step: 2, tool: "commit_hold", args: { hold_ids: ["<from step 1>"] }, note: "confirms it atomically" },
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
        "Use this when you have the hold_ids from hold_slot and the booking is confirmed. Turns every hold into a booking in one atomic step: all of them or none, so the slot cannot be lost between reserving and confirming and a group can never be half booked. This is the only way to create a booking. If it is refused, the reply may list other free times: offer one and call hold_slot on it, since none of them is reserved for you.",
      inputSchema: {
        hold_ids: HOLD_IDS,
        label: z.string().max(200).optional().describe("who the booking is for"),
        timezone: z.string().default("UTC").describe("IANA timezone for rendering any alternative times"),
      },
    },
    async ({ hold_ids, label, timezone }) => {
      try {
        const { bookingIds } = await dt.holds.commitMany(hold_ids, label ? { label } : undefined);
        return ok(JSON.stringify({ booking_ids: bookingIds, status: "confirmed" }));
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
        "Use this as soon as you know a held time is not wanted, for example the person picked a different slot or ended the conversation. Frees every slot immediately instead of leaving them blocked until the holds expire. Safe to call on a hold that already expired.",
      inputSchema: { hold_ids: HOLD_IDS },
    },
    async ({ hold_ids }) => {
      try {
        await Promise.all(hold_ids.map((id) => dt.holds.release(id)));
        return ok(JSON.stringify({ hold_ids, status: "released" }));
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
