import { describe, expect, test } from "bun:test";
import { classifyRefusal, counterOffer, sqlstateOf } from "../errors.js";

// This parser runs inside a caller's catch block, where throwing a second error is the worst thing
// it could do. Every test below is either "the happy path is correct" or "this weird input yields
// null instead of blowing up".

const detailOf = (body: unknown) => ({
  code: "40001",
  detail: JSON.stringify(body),
});

const validBody = {
  deltat: 1,
  kind: "conflict",
  sqlstate: "40001",
  retry_same_span: true,
  reserved: false,
  as_of: 1_700_000_000_000,
  resource_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  requested: { start: 1000, end: 2000 },
  schedule: "known",
  alternatives: [
    { start: 3000, end: 4000 },
    { start: 5000, end: 6000 },
  ],
};

describe("counterOffer", () => {
  test("parses a refusal into typed alternatives", () => {
    const offer = counterOffer(detailOf(validBody));
    expect(offer).not.toBeNull();
    expect(offer?.kind).toBe("conflict");
    expect(offer?.retrySameSpan).toBe(true);
    expect(offer?.reserved).toBe(false);
    expect(offer?.resourceId).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(offer?.requested).toEqual({ start: 1000, end: 2000 });
    expect(offer?.alternatives).toEqual([
      { start: 3000, end: 4000 },
      { start: 5000, end: 6000 },
    ]);
  });

  test("a schedule refusal says the same span is not worth retrying", () => {
    // Alternatives and retryability are different questions. A caller that conflated them would
    // hammer a span that will never open, because the calendar is simply shut then.
    const offer = counterOffer(
      detailOf({ ...validBody, kind: "closed_by_schedule", sqlstate: "23514", retry_same_span: false })
    );
    expect(offer?.retrySameSpan).toBe(false);
    expect(offer?.alternatives.length).toBe(2);
  });

  test("an unscheduled calendar is distinguishable from a full one", () => {
    // The distinction that matters: this resource accepts anything that does not collide, so an
    // empty list means "no windows to enumerate", not "no time available".
    const offer = counterOffer(
      detailOf({ ...validBody, schedule: "unscheduled", alternatives: [] })
    );
    expect(offer?.schedule).toBe("unscheduled");
    expect(offer?.alternatives).toEqual([]);
  });

  test("resourceId is absent rather than null when the statement addressed a hold", () => {
    const { resource_id: _omitted, ...withoutResource } = validBody;
    const offer = counterOffer(detailOf(withoutResource));
    expect(offer).not.toBeNull();
    expect(offer?.resourceId).toBeUndefined();
  });

  describe("returns null instead of throwing", () => {
    test.each([
      ["a plain Error", new Error("boom")],
      ["null", null],
      ["undefined", undefined],
      ["a string", "not an error"],
      ["an error with no detail", { code: "40001" }],
      ["a non-string detail", { code: "40001", detail: 42 }],
      ["a non-JSON detail", { code: "40001", detail: "some prose from another server" }],
      ["JSON that is not an object", { code: "40001", detail: "[1,2,3]" }],
      ["a future payload version", { code: "40001", detail: JSON.stringify({ deltat: 2 }) }],
      ["no version marker at all", { code: "40001", detail: JSON.stringify({ alternatives: [] }) }],
    ])("%s", (_label, input) => {
      expect(counterOffer(input)).toBeNull();
    });

    test("a body missing `requested`, which every real payload has", () => {
      const { requested: _omitted, ...broken } = validBody;
      expect(counterOffer(detailOf(broken))).toBeNull();
    });
  });

  test("malformed spans inside alternatives are dropped, not returned half-built", () => {
    // A caller iterating alternatives must never get an entry with NaN bounds, because it would
    // send that straight back as a booking request.
    const offer = counterOffer(
      detailOf({
        ...validBody,
        alternatives: [{ start: 3000, end: 4000 }, { start: "oops" }, null, { end: 9 }],
      })
    );
    expect(offer?.alternatives).toEqual([{ start: 3000, end: 4000 }]);
  });
});

describe("sqlstateOf", () => {
  test("reads the code so callers branch on it instead of message text", () => {
    expect(sqlstateOf({ code: "23514" })).toBe("23514");
  });

  test("null for anything that is not a Postgres error", () => {
    expect(sqlstateOf(new Error("boom"))).toBeNull();
    expect(sqlstateOf(undefined)).toBeNull();
  });
});

// Both the MCP server and the CLI answer through this, so a code here is what a model acts on: a
// wrong one either abandons a booking it could have made or retries a call that can never work.
describe("classifyRefusal", () => {
  const pgError = (code: string, message: string, detail?: unknown) =>
    Object.assign(new Error(message), { code, ...(detail ? { detail: JSON.stringify(detail) } : {}) });

  test("a lost race is a CONFLICT that carries the times that would work", () => {
    const r = classifyRefusal(pgError("40001", "conflict", validBody));
    expect(r.code).toBe("CONFLICT");
    expect(r.offer?.alternatives).toHaveLength(2);
  });

  test("outside opening hours is a CONFLICT, never INTERNAL, so the caller asks for another time", () => {
    expect(classifyRefusal(pgError("23514", "span is outside open windows or blocked")).code).toBe("CONFLICT");
  });

  test("a lapsed hold is EXPIRED even though its SQLSTATE says unknown id", () => {
    expect(classifyRefusal(pgError("42704", "hold 01X has expired")).code).toBe("EXPIRED");
  });

  test("an unknown id that is not a lapsed hold is NOT_FOUND", () => {
    expect(classifyRefusal(pgError("42704", "resource 01X")).code).toBe("NOT_FOUND");
  });

  test("a reused id and an exceeded limit are the caller's to fix: INVALID", () => {
    expect(classifyRefusal(pgError("23505", "duplicate id")).code).toBe("INVALID");
    expect(classifyRefusal(pgError("54000", "too many ids")).code).toBe("INVALID");
  });

  test("anything unrecognised is INTERNAL and says a retry will not help, rather than inviting a loop", () => {
    const r = classifyRefusal(new Error("connect ECONNREFUSED 127.0.0.1:5433"));
    expect(r.code).toBe("INTERNAL");
    expect(r.message).toContain("retrying the same call will not help");
    expect(r.offer).toBeNull();
  });

  test("never throws, whatever it is handed", () => {
    for (const weird of [undefined, null, 42, "text", { code: 7 }, Object.create(null)]) {
      expect(() => classifyRefusal(weird)).not.toThrow();
    }
  });
});
