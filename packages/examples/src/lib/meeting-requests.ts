import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// Meeting requests: someone signed in asks for a time on a calendar whose owner confirms each
// meeting. A request is deliberately NOT a deltat hold. A hold is sized to a conversation (minutes,
// PRINCIPLES.md: "anything longer is squatting") and deltat caps it at an hour, while an owner may
// answer tomorrow. So the request lives here, beside the registry, and the time is only taken when
// the owner approves (hold and commit in one step, refused if someone else got there first).
//
// Who asked is recorded as the verified principal (`iss#sub`), never as an email (NOT-02 keeps
// identity out of the kernel). The contact the owner sees comes from the identity provider's
// userinfo for that same subject, so "verified" means the provider said so, not the requester.
// One file, one process, the same honest limit as the registry beside it.

/** Ceiling on stored requests, so a caller who outlasts the rate limits still cannot fill the disk. */
export const MAX_MEETING_REQUESTS = 20_000;

export interface RequestContact {
  readonly name: string;
  /** From the identity provider's userinfo; null when it gave none. */
  readonly email: string | null;
  /** True only when the provider marked the email verified. */
  readonly emailVerified: boolean;
}

export type RequestDecision =
  | { readonly status: "pending" }
  | { readonly status: "approved"; readonly decidedAt: number; readonly bookingId: string }
  | { readonly status: "declined"; readonly decidedAt: number; readonly reason: string | null }
  /** The owner approved, but the time had been taken meanwhile; nothing was booked. */
  | { readonly status: "unavailable"; readonly decidedAt: number }
  | { readonly status: "withdrawn"; readonly decidedAt: number };

export type RequestStatus = RequestDecision["status"];

export interface MeetingRequest {
  readonly id: string;
  readonly calendarId: string;
  /** The verified principal who asked (`iss#sub`). Authorization for "my requests" and withdrawal. */
  readonly requester: string;
  readonly contact: RequestContact;
  readonly start: number;
  readonly end: number;
  readonly note: string | null;
  readonly createdAt: number;
  readonly decision: RequestDecision;
}

export interface NewMeetingRequest {
  calendarId: string;
  requester: string;
  contact: RequestContact;
  start: number;
  end: number;
  note: string | null;
}

export interface MeetingRequestStore {
  create(input: NewMeetingRequest): MeetingRequest;
  get(id: string): MeetingRequest | undefined;
  /** Every request on a calendar, newest first. */
  listForCalendar(calendarId: string): MeetingRequest[];
  /** Every request a principal made, newest first. */
  listForRequester(requester: string): MeetingRequest[];
  /**
   * Record a decision on a request that is still pending. Returns the updated request, or undefined
   * when there is no such request or it was already decided: a decision is made once.
   */
  decide(id: string, decision: Exclude<RequestDecision, { status: "pending" }>): MeetingRequest | undefined;
  count(): number;
}

interface StoreFile {
  readonly version: 1;
  readonly requests: readonly MeetingRequest[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function isDecision(value: unknown): value is RequestDecision {
  if (!isRecord(value)) return false;
  switch (value.status) {
    case "pending":
      return true;
    case "approved":
      return isNumber(value.decidedAt) && typeof value.bookingId === "string";
    case "declined":
      return isNumber(value.decidedAt) && (value.reason === null || typeof value.reason === "string");
    case "unavailable":
    case "withdrawn":
      return isNumber(value.decidedAt);
    default:
      return false;
  }
}

function isMeetingRequest(value: unknown): value is MeetingRequest {
  if (!isRecord(value) || !isRecord(value.contact)) return false;
  const c = value.contact;
  return (
    typeof value.id === "string" &&
    typeof value.calendarId === "string" &&
    typeof value.requester === "string" &&
    typeof c.name === "string" &&
    (c.email === null || typeof c.email === "string") &&
    typeof c.emailVerified === "boolean" &&
    isNumber(value.start) &&
    isNumber(value.end) &&
    value.end > value.start &&
    (value.note === null || typeof value.note === "string") &&
    isNumber(value.createdAt) &&
    isDecision(value.decision)
  );
}

function load(path: string): Map<string, MeetingRequest> {
  try {
    if (!existsSync(path)) return new Map();
    const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
    const requests = isRecord(parsed) ? parsed.requests : undefined;
    if (!Array.isArray(requests)) return new Map();
    // A request that fails its shape check is dropped rather than trusted, as in the registry.
    return new Map(requests.filter(isMeetingRequest).map((r) => [r.id, r]));
  } catch {
    return new Map();
  }
}

const newestFirst = (a: MeetingRequest, b: MeetingRequest) => b.createdAt - a.createdAt;

export function openMeetingRequestStore(
  path: string,
  opts?: { maxEntries?: number; now?: () => number; newId?: () => string }
): MeetingRequestStore {
  const maxEntries = opts?.maxEntries ?? MAX_MEETING_REQUESTS;
  const now = opts?.now ?? Date.now;
  const newId = opts?.newId ?? (() => crypto.randomUUID());
  const requests = load(path);

  // Sibling then rename, so a crash mid-write cannot truncate every request at once.
  const flush = (): void => {
    const dir = dirname(path);
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmp = `${path}.tmp`;
    const file: StoreFile = { version: 1, requests: [...requests.values()] };
    writeFileSync(tmp, JSON.stringify(file));
    renameSync(tmp, path);
  };

  return {
    create(input) {
      if (requests.size >= maxEntries) {
        throw new Error("Too many meeting requests are stored right now; none can be added.");
      }
      const request: MeetingRequest = {
        id: newId(),
        ...input,
        createdAt: now(),
        decision: { status: "pending" },
      };
      requests.set(request.id, request);
      flush();
      return request;
    },

    get(id) {
      return requests.get(id);
    },

    listForCalendar(calendarId) {
      return [...requests.values()].filter((r) => r.calendarId === calendarId).sort(newestFirst);
    },

    listForRequester(requester) {
      return [...requests.values()].filter((r) => r.requester === requester).sort(newestFirst);
    },

    decide(id, decision) {
      const request = requests.get(id);
      if (!request || request.decision.status !== "pending") return undefined;
      const decided: MeetingRequest = { ...request, decision };
      requests.set(id, decided);
      flush();
      return decided;
    },

    count() {
      return requests.size;
    },
  };
}
