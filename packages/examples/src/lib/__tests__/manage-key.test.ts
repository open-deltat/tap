import { test, expect } from "bun:test";
import { mintManageKey, hashManageKey, verifyManageKey, MANAGE_KEY_LENGTH } from "../manage-key";

// The manage key is the ONLY thing standing between a stranger and someone else's bookable, and
// it travels in a URL people paste around. These tests pin the two properties that matter: it is
// unguessable, and the server never keeps a copy that could be replayed if the store leaks.

test("minted keys are unique across many draws", () => {
  const keys = new Set(Array.from({ length: 1000 }, mintManageKey));
  expect(keys.size).toBe(1000);
});

test("a minted key is URL-safe so it survives being pasted into a link", () => {
  for (const key of Array.from({ length: 50 }, mintManageKey)) {
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(key).toBe(encodeURIComponent(key));
  }
});

test("a minted key carries at least 128 bits of entropy", () => {
  // base64url packs 6 bits per character, so the length is the entropy floor. Below ~128 bits an
  // attacker with the public booking link can grind for the manage key offline.
  expect(MANAGE_KEY_LENGTH * 6).toBeGreaterThanOrEqual(128);
  expect(mintManageKey()).toHaveLength(MANAGE_KEY_LENGTH);
});

test("hashing is deterministic for one key and distinct across keys", () => {
  const key = mintManageKey();
  expect(hashManageKey(key)).toBe(hashManageKey(key));
  expect(hashManageKey(key)).not.toBe(hashManageKey(mintManageKey()));
});

test("the stored hash is not the key, so a leaked store grants nothing", () => {
  const key = mintManageKey();
  const hash = hashManageKey(key);
  expect(hash).not.toBe(key);
  expect(hash).not.toContain(key);
});

test("verify accepts the key that produced the hash", () => {
  const key = mintManageKey();
  expect(verifyManageKey(key, hashManageKey(key))).toBe(true);
});

test("verify rejects any other key", () => {
  const hash = hashManageKey(mintManageKey());
  for (const wrong of ["", "not-a-key", mintManageKey()]) {
    expect(verifyManageKey(wrong, hash)).toBe(false);
  }
});

test("verify rejects a key that only shares a prefix", () => {
  const key = mintManageKey();
  const hash = hashManageKey(key);
  expect(verifyManageKey(key.slice(0, -1), hash)).toBe(false);
  expect(verifyManageKey(`${key}x`, hash)).toBe(false);
});

test("verify returns false for a malformed stored hash instead of throwing", () => {
  // A hand-edited or half-written registry must fail closed, not crash the route and not throw a
  // stack trace that reveals the comparison internals.
  for (const bad of ["", "zz", "not-hex", "a".repeat(63)]) {
    expect(verifyManageKey(mintManageKey(), bad)).toBe(false);
  }
});
