import { z } from "zod";

/**
 * Giving a slot back when the visitor walks away from it.
 *
 * A React effect cleanup only runs when React unmounts the tree. That happens on an in-app
 * navigation and never on a reload, a tab close, or a cross-document navigation: the browser tears
 * the document down without waiting for anything, and a server action is a `fetch`, so one already
 * in flight is cancelled along with it. The in-app path alone therefore leaves the slot squatted
 * until the TTL reaps it, and the TTL is the backstop, not the mechanism.
 *
 * Two things close that gap, and both earn their place because each catches a case the other
 * misses:
 *  - a `pagehide` beacon, which the browser undertakes to deliver after the document is gone;
 *  - a note in sessionStorage, swept on the next mount, for when the tab died outright (mobile
 *    process death, a crash, a blocked beacon) and nothing got the chance to send anything.
 * Release is idempotent, so where the two overlap the cost is one wasted round trip.
 */

/** Crockford base32: the shape of every id deltat mints. Rejects a probe before it reaches the kernel. */
const ID_SHAPE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

const DeltaTId = z.string().regex(ID_SHAPE, "not a deltat id");

export const ReleaseHoldInput = z.object({ id: DeltaTId, holdId: DeltaTId });
export type ReleaseHoldInput = z.infer<typeof ReleaseHoldInput>;

/** Where the beacon goes. One constant so the sender and the handler cannot drift apart. */
export const RELEASE_HOLD_PATH = "/api/holds/release";

/** A release body is two ids and their braces; anything larger was never one of ours. */
export const MAX_RELEASE_BODY_BYTES = 256;

const StoredHold = z.object({ holdId: DeltaTId, expiresAt: z.number().finite() });
export type StoredHold = z.infer<typeof StoredHold>;

function fromJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** The handler's whole input gate: bounded, well-formed, and two ids deltat could plausibly have minted. */
export function parseReleaseHoldBody(raw: string): ReleaseHoldInput | null {
  // Characters, not bytes, which is the stricter of the two: UTF-8 never spends less than a byte on
  // one, so anything inside this is inside the byte budget as well.
  if (raw.length > MAX_RELEASE_BODY_BYTES) return null;
  const parsed = ReleaseHoldInput.safeParse(fromJson(raw));
  return parsed.success ? parsed.data : null;
}

const storageKey = (bookableId: string): string => `deltat.hold.${bookableId}`;

// Every sessionStorage call below is wrapped, and all three swallow. Reading the property throws
// when storage is disabled, and writing throws on a full quota or in some private modes. A lost
// note costs us this backstop and nothing else, so it must never be what breaks a booking in front
// of the visitor.

/** Leave a note that this tab is holding a slot, in case the tab dies before it can say so. */
export function rememberHold(bookableId: string, hold: StoredHold): void {
  try {
    window.sessionStorage.setItem(storageKey(bookableId), JSON.stringify(hold));
  } catch {
    // ignored: see above
  }
}

/** Forget the note without touching the hold. For an id that is already spent or already released. */
export function forgetHold(bookableId: string): void {
  try {
    window.sessionStorage.removeItem(storageKey(bookableId));
  } catch {
    // ignored: see above
  }
}

/**
 * The hold this tab left behind, taken so it is only ever swept once.
 *
 * sessionStorage is scoped to one tab, so this can only ever read a note that a previous document
 * of *this* tab wrote. It cannot reach another visitor's hold, which is what keeps the sweep from
 * being a way to release holds that are not ours.
 */
export function takeAbandonedHold(bookableId: string, now = Date.now()): string | null {
  const raw = ((): string | null => {
    try {
      const key = storageKey(bookableId);
      const found = window.sessionStorage.getItem(key);
      window.sessionStorage.removeItem(key);
      return found;
    } catch {
      return null;
    }
  })();
  if (raw === null) return null;

  const parsed = StoredHold.safeParse(fromJson(raw));
  // Past its expiry the server reaper has already taken it, so asking again is a wasted round trip
  // on a public, rate-limited endpoint.
  return parsed.success && parsed.data.expiresAt > now ? parsed.data.holdId : null;
}

/**
 * Hand the release to the browser to deliver once this document is gone.
 *
 * `sendBeacon` is the only API with that guarantee: a `fetch` (and therefore a server action) is
 * cancelled when the document unloads, which is exactly why the effect-cleanup path never worked on
 * reload. The return value says the browser accepted the beacon, not that it arrived, which is why
 * the sessionStorage note stays put until a later mount has swept it.
 */
export function beaconReleaseHold(bookableId: string, holdId: string): boolean {
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return false;
  const body = new Blob([JSON.stringify({ id: bookableId, holdId })], { type: "application/json" });
  return navigator.sendBeacon(RELEASE_HOLD_PATH, body);
}
