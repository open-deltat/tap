import type { Change, Refusal, RefusalCode } from "@open-deltat/client";

// Output in two registers. Human text by default; with --json, one JSON object per result (one per
// line for `watch`) in the same field names the MCP server uses, so a model sees one vocabulary.

/** Distinct per code so a script can branch on `$?` without parsing anything. */
export const EXIT: Record<RefusalCode | "OK", number> = {
  OK: 0,
  INTERNAL: 1,
  INVALID: 2,
  CONFLICT: 3,
  EXPIRED: 4,
  NOT_FOUND: 5,
};

/**
 * Remove control characters from text that did not come from us (labels, names, server messages)
 * before it reaches a terminal. An escape sequence in a booking label could otherwise move the
 * cursor, rewrite earlier lines or retitle the window. JSON output escapes them already.
 */
export const clean = (text: string): string => text.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");

export const iso = (ms: number): string => new Date(ms).toISOString();

export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The calendar fields of an instant in a zone. Output is assembled from these rather than taken from
 * Intl's own formatting, whose punctuation differs between ICU versions ("Thu, 1 Oct 2026 at 09:00"
 * on one runtime, "Thu 1 Oct 2026, 09:00" on another): a line a script or model parses must not
 * change shape with the machine it runs on.
 */
function fields(ms: number, tz: string): Record<string, string> {
  const format = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return Object.fromEntries(format.formatToParts(ms).map((p) => [p.type, p.value]));
}

const dayAndTime = (ms: number, tz: string) => {
  const f = fields(ms, tz);
  return `${f.weekday} ${f.day} ${f.month} ${f.year}, ${f.hour}:${f.minute}`;
};

const timeOnly = (ms: number, tz: string) => {
  const f = fields(ms, tz);
  return `${f.hour}:${f.minute}`;
};

const sameDay = (a: number, b: number, tz: string) => {
  const [x, y] = [fields(a, tz), fields(b, tz)];
  return x.year === y.year && x.month === y.month && x.day === y.day;
};

export const local = (ms: number, tz: string): string => dayAndTime(ms, tz);

/** "Thu, 1 Oct 2026, 09:00 to 12:00", or both dates in full when the range crosses midnight. */
export const range = (start: number, end: number, tz: string): string =>
  sameDay(start, end, tz) ? `${dayAndTime(start, tz)} to ${timeOnly(end, tz)}` : `${dayAndTime(start, tz)} to ${dayAndTime(end, tz)}`;

export const duration = (ms: number): string => {
  const minutes = Math.round(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
};

/** A time as the MCP server returns it: the instant, plus the same instant in the reader's zone. */
export const span = (start: number, end: number, tz: string) => ({
  start: iso(start),
  end: iso(end),
  start_local: local(start, tz),
});

// --- changes, for `watch` ------------------------------------------------------------------------

const idOf = (c: Change) =>
  c.kind === "held" || c.kind === "hold_ended" ? { hold_id: c.holdId } : { booking_id: c.bookingId };

export function changeJson(c: Change, calendarId: string, tz: string, at: number): Record<string, unknown> {
  const when = c.start !== null && c.end !== null ? span(c.start, c.end, tz) : { start: null, end: null, start_local: null };
  return {
    change: c.kind,
    calendar_id: calendarId,
    // Differs from calendar_id when the change happened on a child, such as a seat of a watched flight.
    resource_id: c.resourceId,
    ...when,
    ...idOf(c),
    ...(c.kind === "held" ? { expires_at: iso(c.expiresAt) } : {}),
    ...(c.kind === "hold_ended" || c.kind === "cancelled" ? { may_be_free: true } : {}),
    at: iso(at),
  };
}

const CHANGE_WORD: Record<Change["kind"], string> = {
  held: "held",
  booked: "booked",
  hold_ended: "hold ended",
  cancelled: "cancelled",
};

export function changeLine(c: Change, tz: string, at: number): string {
  const when = c.start !== null && c.end !== null ? range(c.start, c.end, tz) : "time unknown";
  const id = c.kind === "held" || c.kind === "hold_ended" ? `hold ${c.holdId}` : `booking ${c.bookingId}`;
  const note =
    c.kind === "held"
      ? `  expires ${timeOnly(c.expiresAt, tz)}`
      : c.kind === "hold_ended"
        ? "  (released or expired, may be free again)"
        : c.kind === "cancelled"
          ? "  (may be free again)"
          : "";
  return `${timeOnly(at, tz)}  ${CHANGE_WORD[c.kind].padEnd(10)}  ${when}  ${id}${note}`;
}

// --- refusals ----------------------------------------------------------------------------------

const REFUSAL_NEXT: Partial<Record<RefusalCode, string>> = {
  CONFLICT: "Pick another time. Anything listed was free a moment ago but is NOT reserved: hold it before you promise it.",
  EXPIRED: "The hold lapsed. Place a new hold, then commit it.",
  // deltat reports a hold the reaper already removed as an unknown id, so NOT_FOUND on a hold_id
  // usually means it expired.
  NOT_FOUND: "Check the id. A hold that expired is gone too: place a new hold. A hold_id and a booking_id are not interchangeable.",
};

/** Same fields as the MCP server's refusals, so a model that learned one reads the other. */
export function refusalJson(r: Refusal, tz: string): Record<string, unknown> {
  const alternatives = r.offer?.alternatives ?? [];
  const next = REFUSAL_NEXT[r.code];
  return {
    error: r.code,
    message: r.message,
    booked: false,
    held: false,
    reserved: false,
    ...(r.offer ? { retry_same_time: r.offer.retrySameSpan } : {}),
    ...(alternatives.length ? { alternatives: alternatives.map((a) => span(a.start, a.end, tz)) } : {}),
    ...(r.offer?.schedule === "unscheduled" ? { schedule: "unscheduled" } : {}),
    ...(next ? { next } : {}),
  };
}

export function refusalText(r: Refusal, tz: string): string {
  const alternatives = r.offer?.alternatives ?? [];
  const next = REFUSAL_NEXT[r.code];
  const lines = [
    `error ${r.code}: ${clean(r.message)}`,
    ...(alternatives.length
      ? ["Free a moment ago, not reserved:", ...alternatives.map((a) => `  ${range(a.start, a.end, tz)}`)]
      : []),
    ...(r.offer?.schedule === "unscheduled"
      ? ["This calendar publishes no opening hours, so there is no list of free times. It still takes bookings."]
      : []),
    ...(next ? [next] : []),
  ];
  return lines.join("\n");
}
