import { releasePublicHold } from "@open-deltat/examples/actions/public-booking";
import {
  MAX_RELEASE_BODY_BYTES,
  parseReleaseHoldBody,
} from "@open-deltat/examples/lib/hold-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The one thing a booking page can still say to us while its document is being torn down.
 *
 * `navigator.sendBeacon` is what survives a reload or a tab close, and it cannot call a server
 * action: those need the RSC action header on a live `fetch`, and the browser cancels in-flight
 * fetches on unload. So the teardown path needs a plain URL, and a plain URL on a public booking
 * page is by definition unauthenticated.
 *
 * What keeps that from being a griefing tool is that the caller must already know the hold id. That
 * id is a ULID minted server-side and handed to exactly one browser — the one that placed the hold
 * — and its 80 random bits are the same secret that already authorizes `commitPublicHold` (see the
 * SEC-03 note in `bookable-service`). So this endpoint grants strictly less than what someone
 * holding that id can already do, and of the two things they could do with it, releasing is the
 * harmless direction: it frees a slot rather than taking one. Guessing an id is guessing 80 bits;
 * grinding through them is what the rate limits inside `releasePublicHold` are for.
 *
 * Release-only by construction. Only POST is exported, so every other method is a framework 405,
 * and the single call below is the only kernel write reachable from here — there is no branch that
 * can reach `place` or `commit`.
 */
export async function POST(req: Request): Promise<Response> {
  // Cheap pre-read rejection. It only catches a body that declares its size honestly; the real
  // bound is the length check inside parseReleaseHoldBody, which runs on what actually arrived.
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RELEASE_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }

  const input = parseReleaseHoldBody(await req.text());
  if (!input) return new Response(null, { status: 400 });

  await releasePublicHold(input.id, input.holdId);

  // The same 204 whether a hold was there, was someone else's, or was rate-limited away. A status
  // that varied would make this an oracle for which hold ids are live, which is the one piece of
  // information an enumerator is actually after.
  return new Response(null, { status: 204 });
}
