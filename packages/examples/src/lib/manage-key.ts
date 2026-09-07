import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Ownership without accounts: creating a bookable mints one secret, it is shown once, and only its
// digest is kept. Anyone holding the secret is the owner; the server cannot impersonate them and a
// leaked registry file hands over nothing replayable.

/** 192 bits. Well past the 128-bit floor, and divisible by 3 so base64url needs no padding. */
const KEY_BYTES = 24;

/** Characters in a minted key. Exported so the entropy floor is asserted, not assumed. */
export const MANAGE_KEY_LENGTH = 32;

const SHA256_BYTES = 32;

export function mintManageKey(): string {
  return randomBytes(KEY_BYTES).toString("base64url");
}

export function hashManageKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/**
 * Constant-time check of a presented key against a stored digest.
 *
 * Both sides are hashed to a fixed 32 bytes first, so the comparison time cannot depend on how many
 * leading characters matched, nor on the presented key's length. A stored digest that is not a
 * well-formed sha256 (hand-edited or half-written registry) fails closed rather than throwing.
 */
export function verifyManageKey(key: string, storedHash: string): boolean {
  const expected = Buffer.from(storedHash, "hex");
  if (expected.length !== SHA256_BYTES) return false;
  const presented = createHash("sha256").update(key, "utf8").digest();
  return timingSafeEqual(presented, expected);
}
