"use server";

import { z } from "zod";
import { meetings } from "../lib/meetings";
import { effectiveStatus } from "../lib/meeting-request-service";
import type { MeetingRequest, RequestContact, RequestStatus } from "../lib/meeting-requests";
import type { Outcome } from "../lib/bookable-service";
import { authConfig, getSession } from "../lib/auth-session";
import { fetchVerifiedContact } from "../lib/userinfo";
import { createRateLimiter } from "../lib/rate-limit";

// The web edge of meeting requests: session identity, rate limits and input shapes here, every rule
// in lib/meeting-request-service (shared with the hosted MCP endpoint). A Next action is a public
// endpoint whatever the UI shows, so each input is parsed before it reaches the service.

const HOUR_MS = 3_600_000;
const perPrincipalRequests = createRateLimiter({ limit: 30, windowMs: HOUR_MS });
const perPrincipalAnswers = createRateLimiter({ limit: 300, windowMs: HOUR_MS });

const Id = z.string().min(1).max(64);
const RequestInput = z.object({
  calendarId: Id,
  start: z.number().int(),
  end: z.number().int(),
  note: z.string().max(2_000).nullish(),
  /** Used only when the identity provider gives no name. */
  name: z.string().max(200).nullish(),
});

/** What a page renders. The contact is present only in the owner's view. */
export interface RequestView {
  id: string;
  calendarId: string;
  start: number;
  end: number;
  note: string | null;
  createdAt: number;
  status: RequestStatus | "expired";
  /** The owner's reason, when declined with one. */
  reason: string | null;
  contact?: RequestContact;
}

function toView(request: MeetingRequest, withContact: boolean): RequestView {
  const { decision } = request;
  return {
    id: request.id,
    calendarId: request.calendarId,
    start: request.start,
    end: request.end,
    note: request.note,
    createdAt: request.createdAt,
    status: effectiveStatus(request, Date.now()),
    reason: decision.status === "declined" ? decision.reason : null,
    ...(withContact && { contact: request.contact }),
  };
}

const viewed = (withContact: boolean) => (outcome: Outcome<MeetingRequest>): Outcome<RequestView> =>
  outcome.ok ? { ok: true, value: toView(outcome.value, withContact) } : outcome;

const slowDown = (retryAfterMs: number) =>
  `Too many at once. Try again in ${Math.max(1, Math.ceil(retryAfterMs / 60_000))} minutes.`;

/** The signed-in caller's name and email as the identity provider states them, or null. */
export async function myContact(): Promise<RequestContact | null> {
  const session = await getSession();
  const config = authConfig();
  if (!session || !config || !session.principal.sub) return null;
  return fetchVerifiedContact(session.token, { userinfoUrl: config.userinfoUrl, expectedSub: session.principal.sub });
}

export async function requestMeeting(raw: z.input<typeof RequestInput>): Promise<Outcome<RequestView>> {
  const input = RequestInput.safeParse(raw);
  if (!input.success) return { ok: false, error: "That request is not in a shape this server accepts." };
  const session = await getSession();
  if (!session) return { ok: false, error: "SIGN_IN_REQUIRED" };
  const gate = perPrincipalRequests.check(session.principal.principalId);
  if (!gate.allowed) return { ok: false, error: slowDown(gate.retryAfterMs) };

  const verified = await myContact();
  const typed = input.data.name?.trim();
  const contact: RequestContact | null = verified ?? (typed ? { name: typed, email: null, emailVerified: false } : null);
  if (!contact) return { ok: false, error: "Add your name, so the owner knows who is asking." };

  return viewed(false)(
    await meetings.request({
      calendarId: input.data.calendarId,
      requester: session.principal.principalId,
      contact,
      start: input.data.start,
      end: input.data.end,
      note: input.data.note ?? null,
    })
  );
}

/** The caller's own requests on one calendar, newest first. Empty when signed out. */
export async function myMeetingRequests(calendarId: string): Promise<RequestView[]> {
  if (!Id.safeParse(calendarId).success) return [];
  const session = await getSession();
  if (!session) return [];
  return meetings
    .mine(session.principal.principalId)
    .filter((r) => r.calendarId === calendarId)
    .map((r) => toView(r, false));
}

export async function withdrawMeetingRequest(requestId: string): Promise<Outcome<RequestView>> {
  if (!Id.safeParse(requestId).success) return { ok: false, error: "No such request of yours." };
  const session = await getSession();
  if (!session) return { ok: false, error: "SIGN_IN_REQUIRED" };
  return viewed(false)(meetings.withdraw({ requestId, requester: session.principal.principalId }));
}

/** The owner's inbox for one calendar. */
export async function calendarMeetingRequests(calendarId: string): Promise<Outcome<RequestView[]>> {
  if (!Id.safeParse(calendarId).success) return { ok: false, error: "You do not own this calendar." };
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to see requests." };
  const inbox = meetings.forOwner({ calendarId, owner: session.principal.principalId });
  return inbox.ok ? { ok: true, value: inbox.value.map((r) => toView(r, true)) } : inbox;
}

export async function approveMeetingRequest(requestId: string): Promise<Outcome<RequestView>> {
  if (!Id.safeParse(requestId).success) return { ok: false, error: "No such request on a calendar you own." };
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to answer requests." };
  const gate = perPrincipalAnswers.check(session.principal.principalId);
  if (!gate.allowed) return { ok: false, error: slowDown(gate.retryAfterMs) };
  return viewed(true)(await meetings.approve({ requestId, owner: session.principal.principalId }));
}

export async function declineMeetingRequest(requestId: string, reason?: string | null): Promise<Outcome<RequestView>> {
  if (!Id.safeParse(requestId).success || (reason != null && typeof reason !== "string")) {
    return { ok: false, error: "No such request on a calendar you own." };
  }
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to answer requests." };
  const gate = perPrincipalAnswers.check(session.principal.principalId);
  if (!gate.allowed) return { ok: false, error: slowDown(gate.retryAfterMs) };
  return viewed(true)(meetings.decline({ requestId, owner: session.principal.principalId, reason: reason?.slice(0, 2_000) ?? null }));
}
