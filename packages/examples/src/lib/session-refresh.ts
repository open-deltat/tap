import { decodeJwt } from "jose";

/**
 * Silent refresh for the website session.
 *
 * The session cookie is the identity provider's access token, which lives about five minutes. The
 * refresh token from sign-in is kept in a second cookie, sealed with AES-GCM under SESSION_SECRET,
 * and traded for a fresh access token when the current one is gone or within a minute of expiry
 * (demo/proxy.ts runs this before pages and server actions, so both see the fresh token).
 *
 * - Rotation: each refresh stores the refresh token the provider returns; the old one is spent.
 * - Failure of any kind (refused, unreachable, a body that is not a token pair, a cookie that does
 *   not open) signs the person out by clearing both cookies. Nothing retries, so nothing loops.
 * - A session lives at most SESSION_LIFETIME_MS from sign-in, however often it is refreshed, so a
 *   stolen cookie does not live forever.
 * - No SESSION_SECRET (or not 32 bytes): no refresh at all, which is how the site behaved before.
 *
 * The refresh grant is the one the WorkOS SDK sends for a public client (`authenticateWithRefresh
 * Token`: grant_type=refresh_token, client_id, refresh_token, no secret), posted to the token URL
 * the code exchange already uses, form-encoded as that exchange is and as OAuth 2.0 §6 specifies.
 */

/** A session ends this long after sign-in, refreshed or not. */
export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/** Refresh this long before the access token expires, so a request never carries a dying token. */
const REFRESH_EARLY_MS = 60_000;

/** Binds a sealed value to this one use, so no other AES-GCM blob under the same key opens as one. */
const PURPOSE = new TextEncoder().encode("deltat.refresh.v1");

export interface RefreshDeps {
  key: CryptoKey | null;
  tokenUrl: string;
  clientId: string;
  fetch: typeof fetch;
  now: () => number;
}

export interface SealedRefresh {
  refreshToken: string;
  /** When the person signed in. The lifetime cap counts from here, across every refresh. */
  startedAt: number;
}

export type RefreshDecision =
  | { kind: "keep" }
  | { kind: "refreshed"; session: string; sessionMaxAgeSeconds: number; refresh: string; refreshMaxAgeSeconds: number }
  | { kind: "signed-out" };

/** SESSION_SECRET as an AES-256-GCM key: base64 of exactly 32 bytes, else null (refresh off). */
export async function importSessionKey(raw: string | undefined): Promise<CryptoKey | null> {
  const value = raw?.trim();
  if (!value) return null;
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== 32) return null;
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealRefresh(key: CryptoKey | null, value: SealedRefresh): Promise<string> {
  if (!key) throw new Error("sealRefresh needs a key");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: PURPOSE }, key, plain));
  return Buffer.concat([iv, sealed]).toString("base64url");
}

/** The sealed value, or null for anything that does not open under this key or has the wrong shape. */
export async function unsealRefresh(key: CryptoKey | null, cookie: string): Promise<SealedRefresh | null> {
  if (!key) return null;
  try {
    const bytes = Buffer.from(cookie, "base64url");
    if (bytes.length < 12 + 16) return null;
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.subarray(0, 12), additionalData: PURPOSE }, key, bytes.subarray(12));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(plain));
    if (typeof parsed !== "object" || parsed === null) return null;
    const r: Record<string, unknown> = Object.fromEntries(Object.entries(parsed));
    return typeof r.refreshToken === "string" && r.refreshToken !== "" && typeof r.startedAt === "number"
      ? { refreshToken: r.refreshToken, startedAt: r.startedAt }
      : null;
  } catch {
    return null; // tampered, truncated, another key, not base64: all the same answer
  }
}

/** When the access token expires, read without verifying: it only decides whether to refresh. */
function expiresAt(token: string | undefined): number | null {
  if (!token) return null;
  try {
    const { exp } = decodeJwt(token);
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

type Grant = { ok: true; accessToken: string; refreshToken: string } | { ok: false };

/** The refresh grant. The reply is untrusted until its status and its body's shape are checked. */
async function refreshGrant(deps: RefreshDeps, refreshToken: string): Promise<Grant> {
  try {
    const res = await deps.fetch(deps.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: deps.clientId, refresh_token: refreshToken }).toString(),
    });
    if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) return { ok: false };
    const body: unknown = await res.json();
    if (typeof body !== "object" || body === null) return { ok: false };
    const r: Record<string, unknown> = Object.fromEntries(Object.entries(body));
    return typeof r.access_token === "string" && r.access_token !== "" && typeof r.refresh_token === "string" && r.refresh_token !== ""
      ? { ok: true, accessToken: r.access_token, refreshToken: r.refresh_token }
      : { ok: false };
  } catch {
    return { ok: false };
  }
}

// One refresh per refresh token, shared. A page load sends several requests at once, all carrying the
// same expiring session; each refreshing on its own would spend the token once and present it again,
// and with rotation the second presentation fails and signs the person out. A request that arrives
// just after, before the browser has stored the new cookies, gets the same answer for a short while.
// Process-wide (globalThis) because the proxy and the app are separate module graphs in one process.
const RECENT_MS = 30_000;
type Flight = { at: number; decision: Promise<RefreshDecision> };
const shared = globalThis as typeof globalThis & { __deltatRefreshes?: Map<string, Flight> };
const flights = (shared.__deltatRefreshes ??= new Map<string, Flight>());

/** Test seam: start from no refreshes in flight. */
export function forgetRefreshes(): void {
  flights.clear();
}

async function refreshOnce(deps: RefreshDeps, sealed: SealedRefresh, now: number): Promise<RefreshDecision> {
  const grant = await refreshGrant(deps, sealed.refreshToken);
  if (!grant.ok) return { kind: "signed-out" };
  const tokenExpiry = expiresAt(grant.accessToken);
  return {
    kind: "refreshed",
    session: grant.accessToken,
    sessionMaxAgeSeconds: Math.max(1, Math.floor(((tokenExpiry ?? now + 300_000) - now) / 1000)),
    refresh: await sealRefresh(deps.key, { refreshToken: grant.refreshToken, startedAt: sealed.startedAt }),
    refreshMaxAgeSeconds: Math.floor((sealed.startedAt + SESSION_LIFETIME_MS - now) / 1000),
  };
}

/** What to do with this request's session cookies. Never throws. */
export async function refreshSession(
  deps: RefreshDeps,
  cookies: { session: string | undefined; refresh: string | undefined }
): Promise<RefreshDecision> {
  if (!deps.key || !cookies.refresh) return { kind: "keep" };
  const now = deps.now();
  const expiry = expiresAt(cookies.session);
  if (expiry !== null && expiry - now > REFRESH_EARLY_MS) return { kind: "keep" };

  const sealed = await unsealRefresh(deps.key, cookies.refresh);
  if (!sealed) return { kind: "signed-out" };
  if (now - sealed.startedAt >= SESSION_LIFETIME_MS) return { kind: "signed-out" };

  for (const [token, flight] of flights) if (now - flight.at > RECENT_MS) flights.delete(token);
  const existing = flights.get(sealed.refreshToken);
  if (existing) return existing.decision;
  const decision = refreshOnce(deps, sealed, now);
  flights.set(sealed.refreshToken, { at: now, decision });
  return decision;
}
