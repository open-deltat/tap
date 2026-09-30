import type { RequestContact } from "./meeting-requests";

// Who is asking, in words the owner can use: the identity provider's OIDC userinfo for the caller's
// own access token. Called with that token only, so it can describe nobody but the caller, and its
// answer is accepted only when it names the same subject the token was verified for.

const TIMEOUT_MS = 5_000;
const asString = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/**
 * The caller's contact, or null when the provider would not say or said something unusable. Never
 * throws: a provider that is down means the caller types a name, not a failed request.
 */
export async function fetchVerifiedContact(
  token: string,
  opts: { userinfoUrl: string; expectedSub: string; fetchImpl?: typeof fetch }
): Promise<RequestContact | null> {
  const res = await (opts.fetchImpl ?? fetch)(opts.userinfoUrl, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  if (!res?.ok) return null;
  const body: unknown = await res.json().catch(() => null);
  if (typeof body !== "object" || body === null) return null;
  const claims = body as Record<string, unknown>;
  // A userinfo for someone else is not this caller's contact, whatever else it says.
  if (claims.sub !== opts.expectedSub) return null;

  const email = asString(claims.email) ?? null;
  const joined = [asString(claims.given_name), asString(claims.family_name)].filter(Boolean).join(" ");
  const name = asString(claims.name) ?? (joined || undefined) ?? email?.split("@")[0];
  if (!name) return null;
  return { name, email, emailVerified: email !== null && claims.email_verified === true };
}
