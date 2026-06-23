import { createHash, timingSafeEqual } from "crypto";

/**
 * Compare two strings via fixed-length digests so the check time does not depend on how many
 * leading characters match, closing the timing side channel on signature and password compares.
 * Hashing first lets it compare values of differing length without leaking length through an early
 * return.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const aHash = createHash("sha256").update(a).digest();
  const bHash = createHash("sha256").update(b).digest();
  return timingSafeEqual(aHash, bHash);
}
