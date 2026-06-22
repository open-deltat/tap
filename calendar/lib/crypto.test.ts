import { test, expect } from "bun:test";
import { constantTimeEqual } from "./crypto";

test("constantTimeEqual is true only for identical strings", () => {
  expect(constantTimeEqual("hunter2", "hunter2")).toBe(true);
  expect(constantTimeEqual("hunter2", "hunter3")).toBe(false);
});

test("constantTimeEqual handles differing lengths and empty strings without throwing", () => {
  expect(constantTimeEqual("a", "abcdefghijklmnop")).toBe(false);
  expect(constantTimeEqual("", "")).toBe(true);
  expect(constantTimeEqual("", "x")).toBe(false);
});

test("constantTimeEqual handles unicode", () => {
  expect(constantTimeEqual("café ☕", "café ☕")).toBe(true);
  expect(constantTimeEqual("café ☕", "cafe ☕")).toBe(false);
});
