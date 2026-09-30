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
    // Each of these is a real booking on the wrong day if Date.parse is trusted: it rolls
    // 2026-02-30 to 2 March and 24:00 to the next morning.
    for (const input of [
      "2026-13-45T25:00Z",
      "2026-02-30T09:00:00Z",
      "2026-02-29T09:00:00Z", // 2026 is not a leap year
      "2026-04-31T09:00:00Z",
      "2026-06-01T24:00:00Z",
      "2026-06-01T23:60:00Z",
      "2026-06-01T23:59:60Z",
      "2026-06-01T09:00:00+24:00",
      "2026-00-10T09:00:00Z",
      "2026-06-00T09:00:00Z",
    ]) {
      expect(parseInstant(input)).toMatchObject({ ok: false });
    }
  });

  test("accepts the real edges of the calendar", () => {
    expect(ms("2028-02-29T09:00:00Z")).toBe(Date.UTC(2028, 1, 29, 9)); // leap year
    expect(ms("2000-02-29T00:00:00Z")).toBe(Date.UTC(2000, 1, 29)); // divisible by 400
    expect(ms("2026-12-31T23:59:59+14:00")).toBe(Date.UTC(2026, 11, 31, 9, 59, 59));
  });

  test("refuses 29 February in a century year that is not a leap year", () => {
    expect(parseInstant("2100-02-29T09:00:00Z").ok).toBe(false);
  });
});
