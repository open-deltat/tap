import { test, expect } from "bun:test";
import type { Sql } from "postgres";
import { Holds } from "../holds.js";

// See bookings.test.ts for why the Sql double is a narrow double-cast, and why the emitted query
// is recorded rather than only the returned rows.
function stubSql(rows: Record<string, unknown>[]): { sql: Sql; calls: { query: string; params: unknown[] }[] } {
  const calls: { query: string; params: unknown[] }[] = [];
  const tagged = (strings: TemplateStringsArray, ...params: unknown[]) => {
    calls.push({ query: strings.join("?").trim(), params });
    return Promise.resolve(rows);
  };
  const sql = Object.assign(tagged, {
    unsafe: (query: string, params?: unknown[]) => {
      calls.push({ query: query.trim(), params: params ?? [] });
      return Promise.resolve(rows);
    },
  });
  return { sql: sql as unknown as Sql, calls };
}

const row = (id: string, start: number, end: number) => ({
  id,
  resource_id: "r1",
  start,
  end,
  expires_at: end + 1000,
});

test("get() pushes the half-open window down as a span predicate", async () => {
  const { sql, calls } = stubSql([row("a", 0, 10), row("b", 10, 20), row("c", 20, 30)]);
  await new Holds(sql).get("r1", { start: 10, end: 20 });
  expect(calls).toHaveLength(1);
  expect(calls[0].query).toBe(
    'SELECT * FROM holds WHERE resource_id = $1 AND start < $2 AND "end" > $3'
  );
  expect(calls[0].params).toEqual(["r1", 20, 10]);
});

test("get() still windows client-side, so an older kernel cannot widen the result", async () => {
  const { sql } = stubSql([row("a", 0, 10), row("b", 10, 20), row("c", 20, 30)]);
  const got = await new Holds(sql).get("r1", { start: 10, end: 20 });
  expect(got.map((h) => h.id)).toEqual(["b"]);
});

test("get() with no window returns every hold", async () => {
  const { sql } = stubSql([row("a", 0, 10), row("b", 10, 20)]);
  const got = await new Holds(sql).get("r1");
  expect(got.map((h) => h.id)).toEqual(["a", "b"]);
});

// commit() must be a single UPDATE statement: the server converts the hold under one lock and
// one WAL append, so any second statement from the SDK would reintroduce the race the method
// exists to close. Recording stub pattern as in rules.test.ts.
type RecordedCall = { query: string; params: unknown[] };

function recordingSql(failOn?: (query: string) => boolean) {
  const calls: RecordedCall[] = [];
  const record = (query: string, params: unknown[]) => {
    calls.push({ query, params });
    if (failOn && failOn(query)) return Promise.reject(new Error(`stub failure: ${query}`));
    return Promise.resolve([]);
  };
  const tagged = (strings: TemplateStringsArray, ...params: unknown[]) =>
    record(strings.join("?").trim(), params);
  const sql = Object.assign(tagged, {
    unsafe: (query: string, params?: unknown[]) => record(query.trim(), params ?? []),
  });
  return { sql: sql as unknown as Sql, calls };
}

const ULID_SHAPE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

test("commit() issues exactly one UPDATE with booking id, label, and hold id", async () => {
  const { sql, calls } = recordingSql();

  const { bookingId } = await new Holds(sql).commit("h1", { label: "seat 14F" });

  expect(calls).toHaveLength(1);
  expect(calls[0].query).toBe("UPDATE holds SET booking_id = ?, label = ? WHERE id = ?");
  expect(calls[0].params).toEqual([bookingId, "seat 14F", "h1"]);
  expect(bookingId).toMatch(ULID_SHAPE);
});

test("commit() without a label omits the label column entirely", async () => {
  const { sql, calls } = recordingSql();

  const { bookingId } = await new Holds(sql).commit("h1");

  expect(calls).toHaveLength(1);
  expect(calls[0].query).toBe("UPDATE holds SET booking_id = ? WHERE id = ?");
  expect(calls[0].params).toEqual([bookingId, "h1"]);
});

test("commit() propagates the server's rejection of an unknown, released, or expired hold", async () => {
  const { sql, calls } = recordingSql((query) => query.startsWith("UPDATE"));

  await expect(new Holds(sql).commit("gone")).rejects.toThrow("stub failure");
  // No fallback statement: the server's verdict is final and the SDK must not retry around it.
  expect(calls).toHaveLength(1);
});
