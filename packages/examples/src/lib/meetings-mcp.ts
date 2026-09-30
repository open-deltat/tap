import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseInstant } from "@open-deltat/client";
import type { MeetingService } from "./meeting-request-service";
import { describeSpan, effectiveStatus } from "./meeting-request-service";
import type { MeetingRequest, RequestContact } from "./meeting-requests";
import type { Outcome } from "./bookable-service";

// The hosted MCP surface: meeting requests and nothing else. Deliberately not the full deltat MCP
// server, which runs with a tenant's password and can cancel any booking in it; exposing that to
// everyone who can sign in would hand the whole public tenant to strangers. Every tool here acts as
// the verified caller, and the service decides what that caller may do: anyone signed in may look
// and ask, only a calendar's owner may answer.

export const MEETINGS_MCP_VERSION = "0.1.0";

export interface MeetingsCaller {
  /** `iss#sub`, verified by the endpoint before this server is built. */
  readonly principalId: string;
  /** The caller's name and email from the identity provider, fetched once, on first use. */
  readonly contact: () => Promise<RequestContact | null>;
}

const ok = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
const refused = (message: string) => ({
  content: [{ type: "text" as const, text: JSON.stringify({ error: "REFUSED", message }) }],
  isError: true,
});

const Instant = z.string().describe("RFC 3339 instant with an offset, e.g. 2026-10-02T10:00:00+02:00");

/** An RFC 3339 instant as ms, or the message to hand back. */
function instant(text: string): Outcome<number> {
  const parsed = parseInstant(text);
  return parsed.ok ? { ok: true, value: parsed.ms } : { ok: false, error: parsed.message };
}

function describeRequest(request: MeetingRequest, timeZone: string, withContact: boolean) {
  const { decision } = request;
  return {
    request_id: request.id,
    calendar_id: request.calendarId,
    start: new Date(request.start).toISOString(),
    end: new Date(request.end).toISOString(),
    when: describeSpan(request.start, request.end, timeZone),
    status: effectiveStatus(request, Date.now()),
    note: request.note,
    ...(decision.status === "declined" && decision.reason ? { reason: decision.reason } : {}),
    ...(withContact && { requested_by: request.contact }),
  };
}

/** What the tools need to know about a calendar to phrase times and default a meeting's length. */
export type CalendarLookup = (calendarId: string) => { timezone: string; slotMinutes: number } | undefined;

export function createMeetingsMcpServer(service: MeetingService, caller: MeetingsCaller, calendarOf: CalendarLookup): McpServer {
  const zoneOf = (calendarId: string) => calendarOf(calendarId)?.timezone ?? "UTC";
  const server = new McpServer(
    { name: "deltat-meetings", version: MEETINGS_MCP_VERSION },
    {
      instructions:
        "Ask for a meeting on a person's calendar, and, if you are that calendar's owner, answer the requests. A request is not a booking: it waits until the owner approves it, and only then is the time booked. Look with find_meeting_times, ask with request_meeting, and check the answer later with my_meeting_requests. Times are RFC 3339 with an offset.",
    }
  );
  const contactOnce = ((): (() => Promise<RequestContact | null>) => {
    const memo: { value: Promise<RequestContact | null> | null } = { value: null };
    return () => (memo.value ??= caller.contact());
  })();

  server.registerTool(
    "find_meeting_times",
    {
      title: "Find times to ask for",
      description:
        "Use this before asking for a meeting: lists the free windows on a calendar that takes meeting requests, between two RFC 3339 instants, with the calendar's slot length. Free now does not mean yours: nothing is held, and the owner decides. Pick a start inside a free window and pass it to request_meeting.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: { calendar_id: z.string().max(64), from: Instant, to: Instant },
    },
    async ({ calendar_id, from, to }) => {
      const start = instant(from);
      const end = instant(to);
      if (!start.ok) return refused(start.error);
      if (!end.ok) return refused(end.error);
      const free = await service.freeTimes({ calendarId: calendar_id, start: start.value, end: end.value });
      if (!free.ok) return refused(free.error);
      const { record, slots } = free.value;
      return ok({
        calendar_id,
        calendar: record.name,
        timezone: record.timezone,
        slot_minutes: record.slotMinutes,
        free: slots.map((s) => ({
          start: new Date(s.start).toISOString(),
          end: new Date(s.end).toISOString(),
          when: describeSpan(s.start, s.end, record.timezone),
        })),
      });
    }
  );

  server.registerTool(
    "request_meeting",
    {
      title: "Ask for a meeting",
      description:
        "Use this to ask the calendar's owner for a meeting at a specific time. It sends a request, it does not book: the owner approves or declines it later, and until then the time is not reserved for you. Tell the person exactly that. Your name and email come from your sign-in; pass your_name only if asked to. Asking again for the same time returns the same request.",
      inputSchema: {
        calendar_id: z.string().max(64),
        start: Instant,
        end: Instant.optional().describe("Defaults to one slot after start"),
        note: z.string().max(500).optional().describe("What the meeting is about, for the owner"),
        your_name: z.string().max(60).optional().describe("Only when the tool says your sign-in shared no name"),
      },
    },
    async ({ calendar_id, start, end, note, your_name }) => {
      const from = instant(start);
      if (!from.ok) return refused(from.error);
      const calendar = calendarOf(calendar_id);
      if (!calendar) return refused("That calendar does not exist.");
      const slotEnd = end ? instant(end) : { ok: true as const, value: from.value + calendar.slotMinutes * 60_000 };
      if (!slotEnd.ok) return refused(slotEnd.error);

      const verified = await contactOnce();
      const typed = your_name?.trim();
      const contact = verified ?? (typed ? { name: typed, email: null, emailVerified: false } : null);
      if (!contact) return refused("Your sign-in shared no name. Ask the person for their name and pass it as your_name.");

      const asked = await service.request({
        calendarId: calendar_id,
        requester: caller.principalId,
        contact,
        start: from.value,
        end: slotEnd.value,
        note: note ?? null,
      });
      if (!asked.ok) return refused(asked.error);
      return ok({
        ...describeRequest(asked.value, calendar.timezone, false),
        booked: false,
        next: "The owner has been asked. Nothing is booked until they approve; check with my_meeting_requests.",
      });
    }
  );

  server.registerTool(
    "my_meeting_requests",
    {
      title: "My meeting requests",
      description:
        "Use this to see what happened to the meetings you asked for: each request with its status (pending, approved, declined, unavailable when the time was taken before the owner approved, withdrawn, or expired when the time came first). Approved means booked.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: { calendar_id: z.string().max(64).optional() },
    },
    async ({ calendar_id }) =>
      ok({
        requests: service
          .mine(caller.principalId)
          .filter((r) => !calendar_id || r.calendarId === calendar_id)
          .map((r) => describeRequest(r, zoneOf(r.calendarId), false)),
      })
  );

  server.registerTool(
    "withdraw_meeting_request",
    {
      title: "Withdraw a meeting request",
      description:
        "Use this when the person no longer wants a meeting they asked for and it is still pending. It withdraws only your own request; an approved meeting is a booking and is not changed by this.",
      annotations: { destructiveHint: true },
      inputSchema: { request_id: z.string().max(64) },
    },
    async ({ request_id }) => {
      const withdrawn = service.withdraw({ requestId: request_id, requester: caller.principalId });
      return withdrawn.ok ? ok(describeRequest(withdrawn.value, zoneOf(withdrawn.value.calendarId), false)) : refused(withdrawn.error);
    }
  );

  server.registerTool(
    "list_meeting_requests",
    {
      title: "Requests on my calendar",
      description:
        "Use this when you are the calendar's owner and want to see who asked for a meeting: every request on that calendar, newest first, with the requester's name and email as their sign-in states them. Only the owner can read this.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: { calendar_id: z.string().max(64) },
    },
    async ({ calendar_id }) => {
      const inbox = service.forOwner({ calendarId: calendar_id, owner: caller.principalId });
      if (!inbox.ok) return refused(inbox.error);
      return ok({ requests: inbox.value.map((r) => describeRequest(r, zoneOf(calendar_id), true)) });
    }
  );

  server.registerTool(
    "approve_meeting_request",
    {
      title: "Approve a meeting request",
      description:
        "Use this when you are the calendar's owner and have decided to meet: it books the requested time under the requester's name. If someone else took that time since the request came in, nothing is booked and the request is marked unavailable; say so rather than offering another time on the owner's behalf.",
      inputSchema: { request_id: z.string().max(64) },
    },
    async ({ request_id }) => {
      const approved = await service.approve({ requestId: request_id, owner: caller.principalId });
      return approved.ok ? ok({ ...describeRequest(approved.value, zoneOf(approved.value.calendarId), true), booked: true }) : refused(approved.error);
    }
  );

  server.registerTool(
    "decline_meeting_request",
    {
      title: "Decline a meeting request",
      description:
        "Use this when you are the calendar's owner and will not take a requested meeting. Nothing was held, so declining frees nothing; the requester sees the request as declined, with your reason if you give one.",
      inputSchema: { request_id: z.string().max(64), reason: z.string().max(200).optional() },
    },
    async ({ request_id, reason }) => {
      const declined = service.decline({ requestId: request_id, owner: caller.principalId, reason: reason ?? null });
      return declined.ok ? ok(describeRequest(declined.value, zoneOf(declined.value.calendarId), true)) : refused(declined.error);
    }
  );

  return server;
}
