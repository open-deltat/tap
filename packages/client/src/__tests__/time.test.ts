import { describe, expect, test } from "bun:test";
import { parseInstant } from "../time.js";

// A timestamp without an offset is read in whatever zone the process runs in, so the same input
// books a different instant on a laptop in Berlin and a server in UTC. Refusing it is the feature.

const ms = (input: string) => {
  const r = parseInstant(input);
  if (!r.ok) throw new Error(`expected ${input} to parse: ${r.message}`);
  return r.ms;
};

describe("parseInstant", () => {
  test("accepts RFC 3339 with an offset, with or without seconds and fractions", () => {
    expect(ms("2026-10-01T07:00:00Z")).toBe(Date.UTC(2026, 9, 1, 7));
    expect(ms("2026-10-01T07:00Z")).toBe(Date.UTC(2026, 9, 1, 7));
    expect(ms("2026-10-01T07:00:00.250Z")).toBe(Date.UTC(2026, 9, 1, 7, 0, 0, 250));
  });

  test("the same instant written in two zones is the same instant", () => {
    expect(ms("2026-10-01T09:00:00+02:00")).toBe(ms("2026-10-01T07:00:00Z"));
  });

  test("refuses a time with no offset instead of guessing the zone", () => {
    const r = parseInstant("2026-10-01T09:00:00");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("offset");
  });

  test("refuses forms Date.parse would leniently accept", () => {
    for (const input of ["2026-10-01", "2026-10-01 09:00:00Z", "Oct 1 2026 09:00 GMT", "tomorrow", "", "1759302000000"]) {
      expect(parseInstant(input).ok).toBe(false);
    }
  });

  test("refuses a well-shaped but impossible date rather than rolling it over", () => {
    expect(parseInstant("2026-13-45T25:00Z").ok).toBe(false);
  });
});
