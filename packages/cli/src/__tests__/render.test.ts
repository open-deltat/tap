import { describe, expect, test } from "bun:test";
import type { Change } from "@open-deltat/client";
import { EXIT, changeJson, changeLine, clean, range, refusalJson } from "../render.js";

describe("clean", () => {
  test("strips terminal control sequences from text a stranger wrote", () => {
    const hostile = "Alex\u001b[2J\u001b]0;pwned\u0007\u009b31m\rX";
    expect(clean(hostile)).toBe("Alex[2J]0;pwned31mX");
    expect(clean(hostile)).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
  });

  test("leaves ordinary text, accents and emoji alone", () => {
    expect(clean("Zoë's table for 4 · 🎉")).toBe("Zoë's table for 4 · 🎉");
  });
});

describe("range", () => {
  const nine = Date.UTC(2026, 9, 1, 7); // 09:00 in Berlin
  test("one date when the range stays inside a day, in the reader's zone", () => {
    expect(range(nine, nine + 3 * 3_600_000, "Europe/Berlin")).toBe("Thu 1 Oct 2026, 09:00 to 12:00");
  });

  test("both dates when it crosses midnight in that zone", () => {
    expect(range(nine + 14 * 3_600_000, nine + 16 * 3_600_000, "Europe/Berlin")).toBe(
      "Thu 1 Oct 2026, 23:00 to Fri 2 Oct 2026, 01:00"
    );
  });
});

describe("changes", () => {
  const booked: Change = { kind: "booked", resourceId: "seat", bookingId: "b1", start: 0, end: 60_000 };
  const unknown: Change = { kind: "cancelled", resourceId: "cal", bookingId: "b2", start: null, end: null };

  test("json names the calendar watched and the resource that changed, and carries no label field", () => {
    const j = changeJson(booked, "cal", "UTC", 0);
    expect(j).toMatchObject({ change: "booked", calendar_id: "cal", resource_id: "seat", booking_id: "b1", start: "1970-01-01T00:00:00.000Z" });
    expect(j).not.toHaveProperty("label");
  });

  test("an end with an unknown time says so instead of inventing one", () => {
    expect(changeJson(unknown, "cal", "UTC", 0)).toMatchObject({ start: null, end: null, may_be_free: true });
    expect(changeLine(unknown, "UTC", 0)).toContain("time unknown");
  });
});

describe("refusals", () => {
  test("say plainly that nothing was booked, held or reserved, as the MCP server does", () => {
    const j = refusalJson(
      {
        code: "CONFLICT",
        message: "taken",
        offer: {
          kind: "conflict",
          sqlstate: "40001",
          retrySameSpan: true,
          reserved: false,
          asOf: 0,
          requested: { start: 0, end: 1 },
          schedule: "known",
          alternatives: [{ start: 3_600_000, end: 7_200_000 }],
        },
      },
      "UTC"
    );
    expect(j).toMatchObject({ error: "CONFLICT", booked: false, held: false, reserved: false, retry_same_time: true });
    expect(j.alternatives).toEqual([{ start: "1970-01-01T01:00:00.000Z", end: "1970-01-01T02:00:00.000Z", start_local: expect.any(String) }]);
  });

  test("every outcome has its own exit code, so a script can branch on $? alone", () => {
    expect(new Set(Object.values(EXIT)).size).toBe(Object.keys(EXIT).length);
    expect(EXIT.OK).toBe(0);
  });
});
