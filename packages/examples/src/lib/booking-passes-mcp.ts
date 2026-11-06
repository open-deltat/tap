import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseInstant } from "@open-deltat/client";
import type { AvailabilitySlot } from "@open-deltat/client";
import type { Outcome } from "./bookable-service";
import { describeInstant, describeSpan } from "./meeting-request-service";
import {
  DEFAULT_PASS_MINUTES,
  MAX_LENGTHS_PER_PASS,
  MAX_LENGTH_MINUTES,
  MAX_LIVE_HOLDS_PER_PASS,
  MAX_PASS_MINUTES,
  MAX_PASS_USES,
  MIN_LENGTH_MINUTES,
  PASS_NOT_VALID,
  type BookingPassService,
  type PassScope,
  type PassView,
} from "./booking-pass-service";
import type { MeetingsCaller } from "./meetings-mcp";

// The booking-pass tools on the hosted server (booking-pass-service.ts holds the rules). The pass is
// a tool argument and nothing else: never a header, never in a result after the one that created it,
// so it does not end up in access logs or in a transcript the owner did not choose to share.

const ok = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
const refused = (message: string) => ({
  content: [{ type: "text" as const, text: JSON.stringify({ error: "REFUSED", message }) }],
  isError: true,
});

const Instant = z.string().describe("RFC 3339 instant with an offset, e.g. 2026-10-02T10:00:00+02:00");
const Pass = z.string().max(100).describe("The booking pass you were given: a code starting dtp_");

function instant(text: string): Outcome<number> {
  const parsed = parseInstant(text);
  return parsed.ok ? { ok: true, value: parsed.ms } : { ok: false, error: parsed.message };
}

const iso = (ms: number) => new Date(ms).toISOString();

/** A window may run over several days; then each edge is named with its own day. */
function describeWindow(from: number, to: number, timeZone: string): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone });
  return day.format(from) === day.format(to)
    ? describeSpan(from, to, timeZone)
    : `${describeInstant(from, timeZone)} to ${describeInstant(to, timeZone)}`;
}

function describeScope(scope: PassScope) {
  const zone = scope.calendar.timezone;
  return {
    calendar: scope.calendar.name,
    timezone: zone,
    window: { from: iso(scope.from), to: iso(scope.to), when: describeWindow(scope.from, scope.to, zone) },
    lengths_minutes: scope.lengthsMinutes,
    bookings_left: scope.usesLeft,
    pass_expires_at: iso(scope.expiresAt),
    pass_expires: describeInstant(scope.expiresAt, zone),
  };
}

function describePass(pass: PassView) {
  const zone = pass.calendar.timezone;
  return {
    pass_id: pass.id,
    calendar_id: pass.calendar.id,
    calendar: pass.calendar.name,
    label: pass.label,
    status: pass.status,
    window: { from: iso(pass.from), to: iso(pass.to), when: describeWindow(pass.from, pass.to, zone) },
    lengths_minutes: pass.lengthsMinutes,
    uses: pass.uses,
    uses_left: pass.usesLeft,
    expires_at: iso(pass.expiresAt),
    expires: describeInstant(pass.expiresAt, zone),
    bookings: pass.bookings.map((b) => ({
      booking_id: b.bookingId,
      start: iso(b.start),
      end: iso(b.end),
      when: describeSpan(b.start, b.end, zone),
      booked_by: b.bookedBy,
      note: b.note,
    })),
  };
}

const describeSlot = (slot: AvailabilitySlot, timeZone: string) => ({
  start: iso(slot.start),
  end: iso(slot.end),
  when: describeSpan(slot.start, slot.end, timeZone),
});

export const BOOKING_PASS_INSTRUCTIONS =
  "If someone gave you a booking pass (a code starting dtp_), book with it directly: find_times_with_pass, then hold_with_pass, then book_with_pass, which spends the pass. If you own a calendar, create_booking_pass mints one for you to send to the person you choose.";

export function registerBookingPassTools(server: McpServer, passes: BookingPassService, caller: MeetingsCaller): void {
  server.registerTool(
    "create_booking_pass",
    {
      title: "Create a booking pass",
      description:
        `Use this when you own a calendar and want one specific person's agent to book a time on it directly, without sending a meeting request. It returns a booking pass (a code starting dtp_) exactly once and never again: send it to that person yourself, however you like (Δt never sends it). Whoever holds the pass can book, so share it only with the person meant. It allows bookings only inside the window [from, to), only for the lengths you allow (default: the calendar's slot length), for \`uses\` bookings (default 1, at most ${MAX_PASS_USES}), and stops working after expires_in_minutes (default ${DEFAULT_PASS_MINUTES}, at most 7 days). Revoke it any time with revoke_booking_pass.`,
      inputSchema: {
        calendar_id: z.string().max(64),
        from: Instant.describe("Start of the window the booking must fall in (RFC 3339 with an offset)"),
        to: Instant.describe("End of the window (RFC 3339 with an offset); within the next 60 days"),
        lengths_minutes: z
          .array(z.number().int().min(MIN_LENGTH_MINUTES).max(MAX_LENGTH_MINUTES))
          .min(1)
          .max(MAX_LENGTHS_PER_PASS)
          .optional()
          .describe("Meeting lengths the holder may book, in minutes. Defaults to the calendar's slot length"),
        uses: z.number().int().min(1).max(MAX_PASS_USES).optional().describe("How many bookings the pass allows. Defaults to 1"),
        expires_in_minutes: z
          .number()
          .int()
          .min(1)
          .max(MAX_PASS_MINUTES)
          .optional()
          .describe(`Minutes until the pass stops working. Defaults to ${DEFAULT_PASS_MINUTES}`),
        label: z.string().max(60).optional().describe("A note for you about who it is for, e.g. \"for Acme's agent\". The holder never sees it"),
      },
    },
    async ({ calendar_id, from, to, lengths_minutes, uses, expires_in_minutes, label }) => {
      const start = instant(from);
      const end = instant(to);
      if (!start.ok) return refused(start.error);
      if (!end.ok) return refused(end.error);
      const made = passes.create({
        owner: caller.principalId,
        calendarId: calendar_id,
        from: start.value,
        to: end.value,
        lengthsMinutes: lengths_minutes,
        uses,
        expiresInMinutes: expires_in_minutes,
        label: label ?? null,
      });
      if (!made.ok) return refused(made.error);
      return ok({
        pass: made.value.token,
        ...describePass(made.value.pass),
        next: "Send the pass to the person yourself; it is shown only this once. Their agent books with find_times_with_pass, hold_with_pass and book_with_pass. Check it with list_booking_passes.",
      });
    }
  );

  server.registerTool(
    "list_booking_passes",
    {
      title: "My booking passes",
      description:
        "Use this when you own a calendar and want to see the booking passes you created: each one's status (active, spending while a booking goes through, spent, revoked or expired), bookings left, expiry, and what was booked with it and by whom. The passes themselves are never shown again; use pass_id to revoke one.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: { calendar_id: z.string().max(64).optional().describe("Only this calendar. Defaults to every calendar you own") },
    },
    async ({ calendar_id }) => {
      const listed = passes.list({ owner: caller.principalId, calendarId: calendar_id });
      return listed.ok ? ok({ passes: listed.value.map(describePass) }) : refused(listed.error);
    }
  );

  server.registerTool(
    "revoke_booking_pass",
    {
      title: "Revoke a booking pass",
      description:
        "Use this when you own the calendar and a booking pass you created should stop working now: it can no longer find, hold or book, and any time it is holding is given back. Bookings already made with it stay booked.",
      annotations: { destructiveHint: true },
      inputSchema: { pass_id: z.string().max(64).describe("The pass_id from create_booking_pass or list_booking_passes, not the pass itself") },
    },
    async ({ pass_id }) => {
      const revoked = await passes.revoke({ owner: caller.principalId, passId: pass_id });
      return revoked.ok ? ok(describePass(revoked.value)) : refused(revoked.error);
    }
  );

  server.registerTool(
    "find_times_with_pass",
    {
      title: "Find times a pass can book",
      description:
        `Use this first when someone gave you a booking pass (a code starting dtp_): it lists the free windows on that calendar inside what the pass allows, the meeting lengths it allows, and how many bookings it has left. Then call hold_with_pass, then book_with_pass. Free now does not mean yours until it is held. A pass that is wrong, expired, used up or revoked gets the one answer "${PASS_NOT_VALID}"; ask the person who sent it for a new one.`,
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: {
        pass: Pass,
        from: Instant.optional().describe("Narrow the search; defaults to the start of the pass's window"),
        to: Instant.optional().describe("Narrow the search; defaults to the end of the pass's window"),
      },
    },
    async ({ pass, from, to }) => {
      const start = from === undefined ? null : instant(from);
      const end = to === undefined ? null : instant(to);
      if (start && !start.ok) return refused(start.error);
      if (end && !end.ok) return refused(end.error);
      const found = await passes.findTimes({ token: pass, caller: caller.principalId, from: start?.value, to: end?.value });
      if (!found.ok) return refused(found.error);
      const { scope, free } = found.value;
      return ok({
        ...describeScope(scope),
        free: free.map((s) => describeSlot(s, scope.calendar.timezone)),
        next: "Pick a start inside a free window and a length from lengths_minutes, then call hold_with_pass.",
      });
    }
  );

  server.registerTool(
    "hold_with_pass",
    {
      title: "Hold a time with a pass",
      description:
        `Use this after find_times_with_pass to reserve one time while you confirm it: pass the start and a length the pass allows. The hold lasts only a few minutes (hold_expires_at says when) and is not a booking: call book_with_pass with the hold_id to book it, or release_with_pass if the person changes their mind. A pass holds at most ${MAX_LIVE_HOLDS_PER_PASS} times at once. If the time was just taken, you get a refusal; pick another free time.`,
      inputSchema: {
        pass: Pass,
        start: Instant,
        length_minutes: z.number().int().positive().optional().describe("One of the pass's lengths_minutes. Needed only when it allows more than one"),
      },
    },
    async ({ pass, start, length_minutes }) => {
      const from = instant(start);
      if (!from.ok) return refused(from.error);
      const held = await passes.hold({ token: pass, caller: caller.principalId, start: from.value, lengthMinutes: length_minutes });
      if (!held.ok) return refused(held.error);
      const { scope, holdId, end, expiresAt } = held.value;
      const zone = scope.calendar.timezone;
      return ok({
        hold_id: holdId,
        start: iso(held.value.start),
        end: iso(end),
        when: describeSpan(held.value.start, end, zone),
        hold_expires_at: iso(expiresAt),
        hold_expires: describeInstant(expiresAt, zone),
        booked: false,
        next: "Held, not booked. Call book_with_pass with this hold_id before the hold expires.",
      });
    }
  );

  server.registerTool(
    "book_with_pass",
    {
      title: "Book a held time with a pass",
      description:
        "Use this to book a time you held with hold_with_pass: pass the same booking pass and the hold_id. This books it on the owner's calendar under your name and spends one of the pass's bookings; when none are left the pass stops working and its other holds are given back. Only holds made with this same pass can be booked. If the hold expired first, nothing is booked and the pass still works: hold the time again.",
      inputSchema: {
        pass: Pass,
        hold_id: z.string().max(64),
        name: z.string().max(60).optional().describe("The name to book under, shown to the owner. Defaults to the name from your sign-in"),
        note: z.string().max(500).optional().describe("What the meeting is about, for the owner"),
      },
    },
    async ({ pass, hold_id, name, note }) => {
      const typed = name?.trim();
      const bookedBy = typed || (await caller.contact())?.name;
      if (!bookedBy) return refused("Your sign-in shared no name. Ask the person for their name and pass it as name.");
      const booked = await passes.book({ token: pass, caller: caller.principalId, holdId: hold_id, bookedBy, note: note ?? null });
      if (!booked.ok) return refused(booked.error);
      const { scope, bookingId, start, end, usesLeft } = booked.value;
      return ok({
        booked: true,
        booking_id: bookingId,
        calendar: scope.calendar.name,
        start: iso(start),
        end: iso(end),
        when: describeSpan(start, end, scope.calendar.timezone),
        booked_by: bookedBy,
        bookings_left: usesLeft,
      });
    }
  );

  server.registerTool(
    "release_with_pass",
    {
      title: "Give back a held time",
      description:
        "Use this when the person no longer wants a time you held with hold_with_pass: it gives the time back now instead of when the hold expires, and frees one of the pass's holds. It releases only holds made with this same pass, and never touches a booking.",
      annotations: { destructiveHint: true },
      inputSchema: { pass: Pass, hold_id: z.string().max(64) },
    },
    async ({ pass, hold_id }) => {
      const released = await passes.release({ token: pass, caller: caller.principalId, holdId: hold_id });
      return released.ok ? ok({ released: true, hold_id: released.value.holdId }) : refused(released.error);
    }
  );
}
