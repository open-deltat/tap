import { test, expect } from "bun:test";
import type { Sql } from "postgres";
import { Rules } from "../rules.js";

// replaceOpenHours is the SDK's most destructive compound mutation: three independent wire
// statements with no transaction behind them. Its two documented safety properties, delete only
// non-blocking rules and create the new rules before deleting the old, live in a filter and a
// statement ordering; this recording stub pins both. Same double-cast pattern as bookings.test.ts,
// extended with the `unsafe` method the multi-row INSERT path uses.
type RecordedCall = { query: string; params: unknown[] };

function recordingSql(
  selectRows: Record<string, unknown>[],
  failOn?: (query: string) => boolean
) {
  const calls: RecordedCall[] = [];
  const record = (query: string, params: unknown[]) => {
    calls.push({ query, params });
    if (failOn && failOn(query)) return Promise.reject(new Error(`stub failure: ${query}`));
    return Promise.resolve(query.startsWith("SELECT") ? selectRows : []);
  };
  const tagged = (strings: TemplateStringsArray, ...params: unknown[]) =>
    record(strings.join("?").trim(), params);
  const sql = Object.assign(tagged, {
    unsafe: (query: string, params?: unknown[]) => record(query.trim(), params ?? []),
  });
  return { sql: sql as unknown as Sql, calls };
}

const ruleRow = (id: string, blocking: boolean) => ({
  id,
  resource_id: "r1",
  start: 0,
  end: 100,
  blocking,
});

const kind = (call: RecordedCall) => call.query.split(" ")[0];

test("replaceOpenHours deletes only the non-blocking rules", async () => {
  const { sql, calls } = recordingSql([
    ruleRow("nb1", false),
    ruleRow("blk1", true),
    ruleRow("nb2", false),
  ]);

  const created = await new Rules(sql).replaceOpenHours("r1", [
    { start: 10, end: 20 },
    { start: 30, end: 40 },
  ]);

  const deletedIds = calls.filter((c) => kind(c) === "DELETE").flatMap((c) => c.params);
  expect(deletedIds.sort()).toEqual(["nb1", "nb2"]);
  expect(created).toHaveLength(2);
  expect(created.every((r) => !r.blocking && r.resourceId === "r1")).toBe(true);
});

test("replaceOpenHours creates the new rules before deleting the old", async () => {
  const { sql, calls } = recordingSql([ruleRow("nb1", false)]);

  await new Rules(sql).replaceOpenHours("r1", [
    { start: 10, end: 20 },
    { start: 30, end: 40 },
  ]);

  const sequence = calls.map(kind);
  const insertAt = sequence.indexOf("INSERT");
  const deleteAt = sequence.indexOf("DELETE");
  expect(sequence[0]).toBe("SELECT");
  expect(insertAt).toBeGreaterThan(-1);
  expect(deleteAt).toBeGreaterThan(insertAt);
});

test("replaceOpenHours with no segments deletes stale open hours and creates nothing", async () => {
  const { sql, calls } = recordingSql([ruleRow("nb1", false), ruleRow("blk1", true)]);

  const created = await new Rules(sql).replaceOpenHours("r1", []);

  expect(created).toEqual([]);
  const sequence = calls.map(kind);
  expect(sequence).not.toContain("INSERT");
  const deletedIds = calls.filter((c) => kind(c) === "DELETE").flatMap((c) => c.params);
  expect(deletedIds).toEqual(["nb1"]);
});

test("when the create fails, no delete has been issued and the old hours survive", async () => {
  const { sql, calls } = recordingSql(
    [ruleRow("nb1", false)],
    (query) => query.startsWith("INSERT")
  );

  // A single segment exercises the tagged-template INSERT path of Rules.create.
  await expect(
    new Rules(sql).replaceOpenHours("r1", [{ start: 10, end: 20 }])
  ).rejects.toThrow("stub failure");

  expect(calls.map(kind)).not.toContain("DELETE");
});

test("when a delete fails, the new rules were already created", async () => {
  const { sql, calls } = recordingSql(
    [ruleRow("nb1", false), ruleRow("nb2", false)],
    (query) => query.startsWith("DELETE")
  );

  await expect(
    new Rules(sql).replaceOpenHours("r1", [
      { start: 10, end: 20 },
      { start: 30, end: 40 },
    ])
  ).rejects.toThrow("stub failure");

  // Worst case is duplicate open rules that merge in availability, never an empty schedule.
  const sequence = calls.map(kind);
  expect(sequence.indexOf("INSERT")).toBeGreaterThan(-1);
  expect(sequence.indexOf("INSERT")).toBeLessThan(sequence.indexOf("DELETE"));
});
