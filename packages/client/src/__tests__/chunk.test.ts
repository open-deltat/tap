import { test, expect } from "bun:test";
import { chunk, MAX_IN_CLAUSE_IDS } from "../chunk.js";

test("chunk splits into fixed-size groups with a short final group", () => {
  expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
});

test("chunk of an empty list is empty", () => {
  expect(chunk([], 2)).toEqual([]);
});

test("a list at exactly the IN-clause limit stays one chunk", () => {
  const ids = Array.from({ length: MAX_IN_CLAUSE_IDS }, (_, i) => i);
  expect(chunk(ids, MAX_IN_CLAUSE_IDS)).toHaveLength(1);
});

test("one past the limit splits so no single query exceeds the kernel bound", () => {
  const ids = Array.from({ length: MAX_IN_CLAUSE_IDS + 1 }, (_, i) => i);
  const groups = chunk(ids, MAX_IN_CLAUSE_IDS);
  expect(groups).toHaveLength(2);
  expect(groups[0]).toHaveLength(MAX_IN_CLAUSE_IDS);
  expect(groups[1]).toHaveLength(1);
});
