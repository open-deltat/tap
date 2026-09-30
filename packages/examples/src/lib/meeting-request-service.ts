import type { AvailabilitySlot, DeltaT } from "@open-deltat/client";
import type { BookableRecord, BookableRegistry } from "./public-bookables";
import type { MeetingRequest, MeetingRequestStore, RequestContact, RequestStatus } from "./meeting-requests";
import type { Notifier } from "./notify";
import { requireDisplayText } from "./display-text";
import { HORIZON_DAYS, MAX_QUERY_WINDOW_MS, type Outcome } from "./bookable-service";

// Asking for a meeting on a calendar whose owner approves each one, and the owner's answer. The web
// actions and the hosted MCP endpoint are thin edges over this, so both enforce the same rules.
//
// The commitment ladder (PRINCIPLES.md §6) decides the shape. Asking is information: nothing is held,
// so a request cannot squat on the owner's week while they sleep on it. Approving is the commitment:
// the time is held and booked in one step, and if someone else took it meanwhile the approval says
// so and books nothing, never a substitute.

export interface MeetingDeps {
  dt: DeltaT;
  registry: BookableRegistry;
  store: MeetingRequestStore;
  notify: Notifier;
  /** Absolute base for the review link in the owner's notification, e.g. https://delt.at. */
  reviewBase?: string | null;
  now?: () => number;
}

/** A request covers one to this many consecutive slots of the calendar's slot length. */
export const MAX_SLOTS_PER_REQUEST = 4;
/** Requests one person may have waiting on one calendar, and across all of them. */
export const MAX_PENDING_PER_CALENDAR = 3;
export const MAX_PENDING_PER_REQUESTER = 10;

const MAX_CONTACT_NAME_LENGTH = 60;
const MAX_NOTE_LENGTH = 500;
const MAX_REASON_LENGTH = 200;
/** Approval holds and commits back to back; the hold only has to outlive that one round trip. */
const APPROVAL_HOLD_MS = 60_000;

const DAY_MS = 86_400_000;

const fail = <T>(error: string): Outcome<T> => ({ ok: false, error });
const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });

/** The stored decision, except that a request still pending when its time has come is expired. */
export function effectiveStatus(request: MeetingRequest, now: number): RequestStatus | "expired" {
  return request.decision.status === "pending" && request.start <= now ? "expired" : request.decision.status;
}

function text(raw: string, field: string, maxLength: number): Outcome<string> {
  try {
    return ok(requireDisplayText(raw, { field, maxLength }));
  } catch (err) {
    return fail(err instanceof Error ? err.message : `That ${field} will not work.`);
  }
}

function optionalText(raw: string | null | undefined, field: string, maxLength: number): Outcome<string | null> {
  if (raw === null || raw === undefined || raw.trim() === "") return ok(null);
  return text(raw, field, maxLength);
}

/**
 * "Thu 2 Oct, 10:00 to 10:30 (Europe/Berlin)", in the calendar's own zone. Assembled from parts
 * rather than `format`: ICU versions disagree on the punctuation between them ("Thu 2 Oct" here,
 * "Thu, 2 Oct" there), and this text goes to the owner and to agents, so it must not vary by machine.
 */
export function describeSpan(start: number, end: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const at = (ms: number) => {
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.formatToParts(ms).find((p) => p.type === type)?.value ?? "";
    return { day: `${part("weekday")} ${part("day")} ${part("month")}`, time: `${part("hour")}:${part("minute")}` };
  };
  const from = at(start);
  return `${from.day}, ${from.time} to ${at(end).time} (${timeZone})`;
}

function validateSpan(record: BookableRecord, start: number, end: number, now: number): Outcome<null> {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return fail("That is not a valid span of time.");
  const slotMs = record.slotMinutes * 60_000;
  const slots = (end - start) / slotMs;
  if (!Number.isInteger(slots) || slots < 1 || slots > MAX_SLOTS_PER_REQUEST) {
    return fail(`Ask for ${record.slotMinutes} minutes, or a multiple of it up to ${MAX_SLOTS_PER_REQUEST} slots.`);
  }
  if (start <= now) return fail("That time has already started. Pick a time in the future.");
  if (start > now + HORIZON_DAYS * DAY_MS) return fail(`Pick a time within the next ${HORIZON_DAYS} days.`);
  return ok(null);
}

const covers = (slots: readonly AvailabilitySlot[], start: number, end: number) =>
  slots.some((slot) => slot.start <= start && slot.end >= end);

export interface MeetingService {
  /** Free windows on a calendar that takes requests, clamped to the calendar's horizon. */
  freeTimes(input: { calendarId: string; start: number; end: number }): Promise<Outcome<{ record: BookableRecord; slots: AvailabilitySlot[] }>>;
  request(input: {
    calendarId: string;
    requester: string;
    contact: RequestContact;
    start: number;
    end: number;
    note?: string | null;
  }): Promise<Outcome<MeetingRequest>>;
  /** Every request a principal made, newest first. */
  mine(requester: string): MeetingRequest[];
  withdraw(input: { requestId: string; requester: string }): Outcome<MeetingRequest>;
  /** The owner's inbox for one calendar, newest first. */
  forOwner(input: { calendarId: string; owner: string }): Outcome<MeetingRequest[]>;
  approve(input: { requestId: string; owner: string }): Promise<Outcome<MeetingRequest>>;
  decline(input: { requestId: string; owner: string; reason?: string | null }): Outcome<MeetingRequest>;
}

export function createMeetingService(deps: MeetingDeps): MeetingService {
  const now = () => deps.now?.() ?? Date.now();
  // One process, as the store is: an approval in flight is locked here so a double-click cannot
  // book twice, or book and then mark the same request unavailable.
  const approving = new Set<string>();

  /** The request if it is on a calendar this principal owns. One message either way: no probing. */
  const owned = (requestId: string, owner: string) => {
    const request = deps.store.get(requestId);
    const record = request && deps.registry.authorizeOwner(request.calendarId, owner);
    return request && record ? { request, record } : null;
  };

  return {
    async freeTimes({ calendarId, start, end }) {
      const record = deps.registry.get(calendarId);
      if (!record || record.bookingMode !== "request") return fail("That calendar does not take meeting requests.");
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return fail("That is not a valid window.");
      const from = Math.max(start, now());
      const to = Math.min(end, from + MAX_QUERY_WINDOW_MS, now() + HORIZON_DAYS * DAY_MS);
      if (to <= from) return ok({ record, slots: [] });
      return ok({ record, slots: await deps.dt.availability.get({ resourceId: calendarId, start: from, end: to }) });
    },

    async request(input) {
      const at = now();
      const record = deps.registry.get(input.calendarId);
      if (!record) return fail("That calendar does not exist.");
      if (record.bookingMode !== "request") {
        return fail("This calendar books directly: pick a time on its page instead of sending a request.");
      }
      const span = validateSpan(record, input.start, input.end, at);
      if (!span.ok) return span;
      const name = text(input.contact.name, "name", MAX_CONTACT_NAME_LENGTH);
      if (!name.ok) return name;
      const note = optionalText(input.note, "note", MAX_NOTE_LENGTH);
      if (!note.ok) return note;

      const mine = deps.store.listForRequester(input.requester);
      const pending = mine.filter((r) => effectiveStatus(r, at) === "pending");
      // Agents retry. Asking again for the same time returns the request already waiting.
      const same = pending.find((r) => r.calendarId === input.calendarId && r.start === input.start && r.end === input.end);
      if (same) return ok(same);
      if (pending.filter((r) => r.calendarId === input.calendarId).length >= MAX_PENDING_PER_CALENDAR) {
        return fail(`You already have ${MAX_PENDING_PER_CALENDAR} requests waiting on this calendar. Wait for an answer, or withdraw one.`);
      }
      if (pending.length >= MAX_PENDING_PER_REQUESTER) {
        return fail(`You already have ${MAX_PENDING_PER_REQUESTER} requests waiting. Wait for an answer, or withdraw one.`);
      }

      // Free now. Nothing is held, so approval checks again and is the real guard.
      const free = await deps.dt.availability.get({ resourceId: input.calendarId, start: input.start, end: input.end });
      if (!covers(free, input.start, input.end)) return fail("That time is not free. Pick another.");

      const created = ((): Outcome<MeetingRequest> => {
        try {
          return ok(
            deps.store.create({
              calendarId: input.calendarId,
              requester: input.requester,
              contact: { ...input.contact, name: name.value },
              start: input.start,
              end: input.end,
              note: note.value,
            })
          );
        } catch (err) {
          return fail(err instanceof Error ? err.message : "The request could not be stored.");
        }
      })();
      if (!created.ok) return created;

      const request = created.value;
      const who = request.contact.email
        ? `${request.contact.name} <${request.contact.email}>${request.contact.emailVerified ? "" : " (email unverified)"}`
        : request.contact.name;
      const review = deps.reviewBase ? ` Review: ${deps.reviewBase}/dashboard/c/${record.id}` : "";
      await deps.notify({
        text: `Meeting request on "${record.name}": ${who} asks for ${describeSpan(request.start, request.end, record.timezone)}.${request.note ? ` Note: ${request.note}` : ""}${review}`,
        calendarId: record.id,
        requestId: request.id,
      });
      return ok(request);
    },

    mine(requester) {
      return deps.store.listForRequester(requester);
    },

    withdraw({ requestId, requester }) {
      const request = deps.store.get(requestId);
      if (!request || request.requester !== requester) return fail("No such request of yours.");
      const status = effectiveStatus(request, now());
      if (status !== "pending") return fail(`That request is already ${status}.`);
      if (approving.has(requestId)) return fail("The owner is approving that request right now.");
      const withdrawn = deps.store.decide(requestId, { status: "withdrawn", decidedAt: now() });
      return withdrawn ? ok(withdrawn) : fail("That request was decided a moment ago.");
    },

    forOwner({ calendarId, owner }) {
      if (!deps.registry.authorizeOwner(calendarId, owner)) return fail("You do not own this calendar.");
      return ok(deps.store.listForCalendar(calendarId));
    },

    async approve({ requestId, owner }) {
      const found = owned(requestId, owner);
      if (!found) return fail("No such request on a calendar you own.");
      const { request } = found;
      const status = effectiveStatus(request, now());
      if (status !== "pending") return fail(`That request is already ${status}.`);
      if (approving.has(requestId)) return fail("That request is already being approved.");

      approving.add(requestId);
      try {
        const hold = await deps.dt.holds
          .place({ resourceId: request.calendarId, start: request.start, end: request.end, expiresAt: now() + APPROVAL_HOLD_MS })
          .catch(() => null);
        if (!hold) {
          deps.store.decide(requestId, { status: "unavailable", decidedAt: now() });
          return fail("That time was taken after the request came in, so nothing was booked. The request now shows as unavailable.");
        }
        const booked = await deps.dt.holds.commit(hold.id, { label: request.contact.name }).catch(() => null);
        if (!booked) {
          await deps.dt.holds.release(hold.id).catch(() => {});
          return fail("Booking it failed. The request is still pending; try again.");
        }
        const approved = deps.store.decide(requestId, { status: "approved", decidedAt: now(), bookingId: booked.bookingId });
        if (!approved) {
          // Decided meanwhile (withdrawn): the booking must not outlive the request it came from.
          await deps.dt.bookings.cancel(booked.bookingId).catch(() => {});
          return fail("The request was withdrawn just now, so nothing was booked.");
        }
        return ok(approved);
      } finally {
        approving.delete(requestId);
      }
    },

    decline({ requestId, owner, reason }) {
      const found = owned(requestId, owner);
      if (!found) return fail("No such request on a calendar you own.");
      const status = effectiveStatus(found.request, now());
      if (status !== "pending") return fail(`That request is already ${status}.`);
      if (approving.has(requestId)) return fail("That request is being approved right now.");
      const why = optionalText(reason, "reason", MAX_REASON_LENGTH);
      if (!why.ok) return why;
      const declined = deps.store.decide(requestId, { status: "declined", decidedAt: now(), reason: why.value });
      return declined ? ok(declined) : fail("That request was decided a moment ago.");
    },
  };
}
