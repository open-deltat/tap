/**
 * Reading an instant a person or a model typed.
 *
 * RFC 3339 with a mandatory offset (Z or ±HH:MM). A zoneless datetime is interpreted in the host's
 * local zone by Date.parse, so the same input would name a different instant depending on where the
 * process runs; for a booking that is a wrong booking. Every field is also checked against the
 * calendar, because Date.parse rolls impossible values over instead of refusing them:
 * 2026-02-30 becomes 2 March and 24:00 becomes the next day, a real booking on a day nobody asked for.
 */

const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export type ParsedInstant = { ok: true; ms: number } | { ok: false; message: string };

export function parseInstant(input: string): ParsedInstant {
  const m = RFC3339.exec(input);
  if (!m) {
    return {
      ok: false,
      message: `Not an RFC 3339 timestamp with an offset (e.g. 2026-06-01T09:00:00Z): ${input}`,
    };
  }
  const [year, month, day, hour, minute, second = 0, offsetHour = 0, offsetMinute = 0] = [
    m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8],
  ].map((part) => (part === undefined ? undefined : Number(part)));

  const monthDays = month !== undefined && month >= 1 && month <= 12 ? DAYS_IN_MONTH[month - 1] : undefined;
  const lastDay = monthDays === 28 && year !== undefined && isLeap(year) ? 29 : monthDays;
  const real =
    lastDay !== undefined &&
    day !== undefined && day >= 1 && day <= lastDay &&
    hour !== undefined && hour <= 23 &&
    minute !== undefined && minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59;
  if (!real) return { ok: false, message: `Not a real date and time: ${input}` };

  const ms = Date.parse(input);
  return Number.isNaN(ms) ? { ok: false, message: `Unparseable timestamp: ${input}` } : { ok: true, ms };
}
