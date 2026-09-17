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
