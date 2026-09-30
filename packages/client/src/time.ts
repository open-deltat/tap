/**
 * Reading an instant a person or a model typed.
 *
 * RFC 3339 with a mandatory offset (Z or ±HH:MM). A zoneless datetime is interpreted in the host's
 * local zone by Date.parse, so the same input would name a different absolute instant depending on
 * where the process runs; for a booking that is a wrong booking. A strict shape also rejects the
 * non-RFC-3339 forms Date.parse leniently accepts.
 */

const RFC3339 = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}(:\d{2})?(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;

export type ParsedInstant = { ok: true; ms: number } | { ok: false; message: string };

export function parseInstant(input: string): ParsedInstant {
  if (!RFC3339.test(input)) {
    return {
      ok: false,
      message: `Not an RFC 3339 timestamp with an offset (e.g. 2026-06-01T09:00:00Z): ${input}`,
    };
  }
  const ms = Date.parse(input);
  return Number.isNaN(ms) ? { ok: false, message: `Unparseable timestamp: ${input}` } : { ok: true, ms };
}
