import { test, expect } from "bun:test";
import type { Sql } from "postgres";
import { Bookings } from "../bookings.js";

// Bookings.get invokes `sql` as a tagged template (unwindowed) or via `sql.unsafe` (windowed, so
// the span predicate can be pushed down to the kernel). postgres's `Sql` is a large branded type
// with no public constructor, so a narrow double-cast stands it in. The call is recorded because
// the emitted SQL is the contract: a transposed `$2`/`$3` would invert the window server-side and
// the client-side re-filter would quietly hide it.
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
  label: null,
});

test("get() pushes the half-open window down as a span predicate", async () => {
  const { sql, calls } = stubSql([row("a", 0, 10), row("b", 10, 20), row("c", 20, 30)]);
  await new Bookings(sql).get("r1", { start: 10, end: 20 });

  // The emitted SQL is the contract. Overlap, not containment, and the bounds cross over: a row
  // must START before the window ends and END after it begins. Transposing $2/$3 would invert the
  // window server-side, and the client-side re-filter below would hide it.
  expect(calls).toHaveLength(1);
  expect(calls[0].query).toBe(
    'SELECT * FROM bookings WHERE resource_id = $1 AND start < $2 AND "end" > $3'
  );
  expect(calls[0].params).toEqual(["r1", 20, 10]);
});

test("get() still windows client-side, so an older kernel cannot widen the result", async () => {
  // A published SDK runs against kernels it did not choose. Against one that predates the
  // span-predicate fix the server returns every row, and this filter is what keeps it correct.
  const { sql } = stubSql([row("a", 0, 10), row("b", 10, 20), row("c", 20, 30)]);
  const got = await new Bookings(sql).get("r1", { start: 10, end: 20 });
  // [0,10) excluded (end == 10, not > 10); [20,30) excluded (start == 20, not < 20).
  expect(got.map((b) => b.id)).toEqual(["b"]);
});

test("get() with no window returns every row unfiltered", async () => {
  const { sql } = stubSql([row("a", 0, 10), row("b", 10, 20)]);
  const got = await new Bookings(sql).get("r1");
  expect(got.map((b) => b.id)).toEqual(["a", "b"]);
});
