import { test, expect } from "bun:test";
import type { Sql } from "postgres";
import { Holds } from "../holds.js";

// See bookings.test.ts for why the Sql double is a narrow double-cast.
function stubSql(rows: Record<string, unknown>[]): Sql {
  return (() => Promise.resolve(rows)) as unknown as Sql;
}

const row = (id: string, start: number, end: number) => ({
  id,
  resource_id: "r1",
  start,
  end,
  expires_at: end + 1000,
});

test("get() windows holds with a half-open overlap despite the kernel returning them all", async () => {
  const sql = stubSql([row("a", 0, 10), row("b", 10, 20), row("c", 20, 30)]);
  const got = await new Holds(sql).get("r1", { start: 10, end: 20 });
  expect(got.map((h) => h.id)).toEqual(["b"]);
});

test("get() with no window returns every hold", async () => {
  const sql = stubSql([row("a", 0, 10), row("b", 10, 20)]);
  const got = await new Holds(sql).get("r1");
  expect(got.map((h) => h.id)).toEqual(["a", "b"]);
});
