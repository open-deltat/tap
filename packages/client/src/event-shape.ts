import type { DeltaTEvent } from "./types.js";

/**
 * A notification payload as a DeltaTEvent, or null when it is not one.
 *
 * The payload comes from the network and is untrusted until its shape is checked: a caller
 * dereferences `Lagged.missed`, `ResourceDeleted.id` or a span's `start` straight away, and a
 * payload that only looks like an event (a scalar, `{"Lagged":{}}`, a span of strings) would
 * otherwise print "missed undefined" or throw inside the subscriber. Anything that fails is
 * skipped, like unparseable JSON. An event of a kind this client does not know is skipped too.
 */
export function asDeltaTEvent(value: unknown): DeltaTEvent | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  const [kind] = keys;
  if (keys.length !== 1 || kind === undefined) return null;
  const body = value[kind];
  if (!isRecord(body)) return null;
  const valid = SHAPES[kind];
  // Checked field by field just above, which is what this cast stands for.
  return valid !== undefined && valid(body) ? (value as DeltaTEvent) : null;
}

type Body = Record<string, unknown>;

const isRecord = (v: unknown): v is Body => typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const orNull = (check: (v: unknown) => boolean) => (v: unknown) => v === null || check(v);
const optional = (check: (v: unknown) => boolean) => (v: unknown) => v === undefined || check(v);
const isSpan = (v: unknown) => isRecord(v) && isNumber(v.start) && isNumber(v.end);
const HOLD_END_REASONS = new Set(["released", "expired", "committed"]);

const fields =
  (spec: Record<string, (v: unknown) => boolean>) =>
  (body: Body): boolean =>
    Object.entries(spec).every(([key, check]) => check(body[key]));

const SHAPES: Record<string, (body: Body) => boolean> = {
  ResourceCreated: fields({
    id: isString,
    parent_id: orNull(isString),
    name: orNull(isString),
    capacity: isNumber,
    buffer_after: orNull(isNumber),
  }),
  ResourceUpdated: fields({ id: isString, name: orNull(isString), capacity: orNull(isNumber), buffer_after: orNull(isNumber) }),
  ResourceDeleted: fields({ id: isString }),
  RuleAdded: fields({ id: isString, resource_id: isString, span: isSpan, blocking: (v) => typeof v === "boolean" }),
  RuleUpdated: fields({ id: isString, resource_id: isString, span: isSpan, blocking: (v) => typeof v === "boolean" }),
  RuleRemoved: fields({ id: isString, resource_id: isString }),
  HoldPlaced: fields({ id: isString, resource_id: isString, span: isSpan, expires_at: isNumber }),
  HoldReleased: fields({
    id: isString,
    resource_id: isString,
    span: optional(isSpan),
    reason: optional((v) => isString(v) && HOLD_END_REASONS.has(v)),
    booking_id: optional(isString),
  }),
  BookingConfirmed: fields({ id: isString, resource_id: isString, span: isSpan, label: orNull(isString) }),
  BookingCancelled: fields({ id: isString, resource_id: isString, span: optional(isSpan) }),
  Lagged: fields({ missed: (v) => isNumber(v) && Number.isInteger(v) && v >= 0 }),
};
