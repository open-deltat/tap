/**
 * Reading what a deltat refusal tells you beyond "no".
 *
 * When the kernel refuses a hold or booking because the span is taken, the resource is full, or the
 * time is outside open hours, it puts machine-readable alternatives in the standard PostgreSQL
 * DETAIL field. This module turns that into a typed value, and does so tolerantly: DETAIL is free
 * text at the protocol level, so anything unparseable yields `null` rather than throwing a second
 * error inside a caller's `catch`.
 */

/** Shape of the JSON deltat puts in DETAIL. Version 1. */
export type CounterOffer = {
  /** The engine's own error label, e.g. `"conflict"`, `"closed_by_schedule"`, `"capacity"`. */
  kind: string;
  /** SQLSTATE the refusal carried. `40001` lost a race; `23514` is outside open hours. */
  sqlstate: string;
  /**
   * Whether retrying the SAME span could ever succeed. False for a schedule refusal: the time is
   * outside opening hours and will not open by waiting.
   */
  retrySameSpan: boolean;
  /**
   * Always false, and present rather than implied. An alternative is a time that was free, not a
   * time held for you; acting on one is a race you can still lose.
   */
  reserved: false;
  /** Engine clock the alternatives were computed against, in Unix ms. */
  asOf: number;
  /** Absent when the statement addressed a hold rather than a resource. */
  resourceId?: string;
  requested: { start: number; end: number };
  /**
   * `"unscheduled"` means the calendar publishes no opening hours, so there were no windows to
   * enumerate. It does NOT mean the calendar is full: such a resource accepts anything that does
   * not collide. Treat an empty `alternatives` under `"unscheduled"` as "no answer available",
   * never as "no time available".
   */
  schedule: "known" | "unscheduled";
  alternatives: { start: number; end: number }[];
};

/** Postgres drivers surface the error's fields; postgres.js names DETAIL `detail`. */
type PgErrorish = { detail?: unknown; code?: unknown };

const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;

const asSpan = (v: unknown): { start: number; end: number } | null => {
  const o = asRecord(v);
  if (!o) return null;
  const { start, end } = o;
  if (typeof start !== "number" || typeof end !== "number") return null;
  return { start, end };
};

/**
 * The SQLSTATE a deltat error carries, or null if it is not a Postgres error.
 *
 * Branch on this rather than on message text. `40001` is a lost race (retry or pick another span),
 * `23514` is outside open hours, `23505` is a reused id, `42704` is an unknown id, which for a hold
 * usually means it expired.
 */
export function sqlstateOf(err: unknown): string | null {
  const e = err as PgErrorish | null | undefined;
  return typeof e?.code === "string" ? e.code : null;
}

/**
 * Parse the counter-offer out of a refused statement, or null if there is not one.
 *
 * Returns null, never throws, for every off-path case: a non-Postgres error, a kernel older than
 * the feature, a kernel with counter-offers disabled, a different Postgres entirely, or a payload
 * version this build does not understand. A refusal with nothing to offer legitimately carries no
 * DETAIL at all, so `null` is an ordinary outcome and not a sign of trouble.
 */
export function counterOffer(err: unknown): CounterOffer | null {
  const detail = (err as PgErrorish | null | undefined)?.detail;
  if (typeof detail !== "string") return null;

  const parsed = ((): unknown => {
    try {
      return JSON.parse(detail);
    } catch {
      // DETAIL is free text at the protocol level. Another server, or another deltat feature,
      // could put prose here.
      return null;
    }
  })();

  const body = asRecord(parsed);
  // Unknown version means unknown shape. Refuse to guess rather than hand a caller fields that
  // might mean something else in a later contract.
  if (!body || body.deltat !== 1) return null;

  const requested = asSpan(body.requested);
  if (!requested) return null;

  const schedule = body.schedule === "unscheduled" ? "unscheduled" : "known";
  const alternatives = Array.isArray(body.alternatives)
    ? body.alternatives.map(asSpan).filter((s): s is { start: number; end: number } => s !== null)
    : [];

  return {
    kind: typeof body.kind === "string" ? body.kind : "unknown",
    sqlstate: typeof body.sqlstate === "string" ? body.sqlstate : (sqlstateOf(err) ?? ""),
    retrySameSpan: body.retry_same_span === true,
    reserved: false,
    asOf: typeof body.as_of === "number" ? body.as_of : 0,
    ...(typeof body.resource_id === "string" ? { resourceId: body.resource_id } : {}),
    requested,
    schedule,
    alternatives,
  };
}

/**
 * What a caller should do about a failed call, as one of five codes. Every surface over the SDK
 * (the MCP server, the CLI) reports refusals through this, so a model gets the same answer for the
 * same failure whichever way it reached deltat.
 */
export type RefusalCode = "CONFLICT" | "EXPIRED" | "INVALID" | "NOT_FOUND" | "INTERNAL";

export type Refusal = {
  code: RefusalCode;
  message: string;
  /** Times the caller could take instead, when the kernel supplied any. */
  offer: CounterOffer | null;
};

/** String(x) throws for an object with no prototype, and this runs inside a caller's catch block. */
function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return "unknown error";
  }
}

/**
 * Map a deltat/pg error to a refusal code.
 *
 * SQLSTATE first, message text only as a fallback for kernels older than the taxonomy. Matching on
 * prose was how `ClosedBySchedule` ("span is outside open windows or blocked") ended up reported as
 * INTERNAL: it matched none of the four patterns, so a request merely outside opening hours told
 * the model that retrying would not help, and the model abandoned a booking it could have made by
 * asking for a different time.
 *
 * The default stays INTERNAL rather than INVALID. INVALID tells a model its arguments were wrong,
 * which invites a retry; for a fault unrelated to the arguments that is an infinite loop, and on a
 * hold each pass leaves a live hold blocking the slot until the reaper expires it.
 */
export function classifyRefusal(err: unknown): Refusal {
  const msg = messageOf(err);
  const offer = counterOffer(err);

  // Before the SQLSTATE switch, not after. A hold that lapsed mid-conversation surfaces as 42704
  // (unknown id), and reporting that as NOT_FOUND would tell the model it had the wrong calendar
  // when the truth is that its hold expired and it should place a new one.
  if (/expired|no longer exists|unknown hold/i.test(msg)) return { code: "EXPIRED", message: msg, offer };

  switch (sqlstateOf(err)) {
    // Lost a race, or the resource filled. Both mean "not this time", and both carry the times
    // that do work.
    case "40001":
      return { code: "CONFLICT", message: msg, offer };
    // Outside open hours or outside the parent's availability. Not a race, so retrying the same
    // span is pointless, but it is exactly where alternatives are most useful.
    case "23514":
      return { code: "CONFLICT", message: msg, offer };
    case "42704":
      return { code: "NOT_FOUND", message: msg, offer };
    case "23505": // reused id
    case "54000": // limit exceeded
      return { code: "INVALID", message: msg, offer };
    case "58030": // WAL / storage fault
      return { code: "INTERNAL", message: msg, offer };
  }

  // Fallback for a kernel that predates real SQLSTATEs, or a non-deltat error.
  if (/conflict|overlap|already|capacity|outside open|blocked/i.test(msg)) {
    return { code: "CONFLICT", message: msg, offer };
  }
  if (/not found|unknown resource|no such/i.test(msg)) return { code: "NOT_FOUND", message: msg, offer };
  if (/invalid|malformed|out of range|must be|cannot parse|unsupported/i.test(msg)) {
    return { code: "INVALID", message: msg, offer };
  }
  return {
    code: "INTERNAL",
    message: `${msg} (this is a server or configuration fault, not a problem with your arguments; retrying the same call will not help)`,
    offer: null,
  };
}
