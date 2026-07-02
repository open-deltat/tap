import { test, expect } from "bun:test";
import type { Sql } from "postgres";
import { Bookings } from "../bookings.js";

// Bookings.get only invokes `sql` as a tagged template and awaits the resulting rows. postgres's
// `Sql` is a large branded type with no public constructor, so a narrow double-cast is the
// least-bad way to stand it in for a unit test of the client-side window filter.
function stubSql(rows: Record<string, unknown>[]): Sql {
  return (() => Promise.resolve(rows)) as unknown as Sql;
}

const row = (id: string, start: number, end: number) => ({
  id,
  resource_id: "r1",
  start,
  end,
  label: null,
});

test("get() windows rows with a half-open overlap even though the kernel returns them all", async () => {
  // The kernel ignores the range predicate and returns every row for the resource; the SDK must
  // window locally, or callers (e.g. the demo's hold-overlap check) get false conflicts.
  const sql = stubSql([row("a", 0, 10), row("b", 10, 20), row("c", 20, 30)]);
  const got = await new Bookings(sql).get("r1", { start: 10, end: 20 });
  // [0,10) excluded (end == 10, not > 10); [20,30) excluded (start == 20, not < 20).
  expect(got.map((b) => b.id)).toEqual(["b"]);
});

test("get() with no window returns every row unfiltered", async () => {
  const sql = stubSql([row("a", 0, 10), row("b", 10, 20)]);
  const got = await new Bookings(sql).get("r1");
  expect(got.map((b) => b.id)).toEqual(["a", "b"]);
});
