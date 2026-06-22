import { test, expect, spyOn } from "bun:test";
import * as crypto from "./crypto";
import { credentialsMatch } from "./credentials";

test("credentialsMatch is true only when both fields match", () => {
  expect(credentialsMatch("admin", "pw", "admin", "pw")).toBe(true);
  expect(credentialsMatch("wrong", "pw", "admin", "pw")).toBe(false);
  expect(credentialsMatch("admin", "wrong", "admin", "pw")).toBe(false);
  expect(credentialsMatch("wrong", "wrong", "admin", "pw")).toBe(false);
});

test("credentialsMatch compares both fields even when the username is wrong", () => {
  // Locks the timing fix: a short-circuit would skip the password compare on a wrong username.
  const spy = spyOn(crypto, "constantTimeEqual");
  credentialsMatch("wrong", "pw", "admin", "pw");
  expect(spy.mock.calls.length).toBe(2);
  spy.mockRestore();
});
