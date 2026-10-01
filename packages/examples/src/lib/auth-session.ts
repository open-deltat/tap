import { cookies } from "next/headers";
import { OidcAdapter, type VerifiedPrincipal } from "@open-deltat/mcp";
import { authConfig, canonicalVerifier, setting } from "./auth-config";

export { authConfig, canonicalPrincipalId, type AuthConfig } from "./auth-config";

// Optional, vendor-neutral sign-in for the demo. Configure any OIDC issuer through AUTH_* env and
// the dashboard lights up; configure nothing and the app runs exactly as before, anonymous /new
// only. No provider is named in this file: a self-hoster points AUTH_ISSUER at Rauthy, Keycloak,
// Auth0, WorkOS, whatever, and it works the same way. The settings themselves are in auth-config.ts.

/**
 * Only a same-origin app path is a safe post-login destination. A denylist is not enough: `new URL`
 * treats a backslash like a slash, so "/\evil.com" resolves to an external origin. Require a single
 * leading "/" followed by something that is neither "/" nor "\".
 */
export function safeReturnTo(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw || !raw.startsWith("/")) return fallback;
  const second = raw[1];
  if (second === "/" || second === "\\") return fallback;
  return raw;
}

/** Cookies must not travel in cleartext outside local development. */
export const cookieSecure = process.env.NODE_ENV === "production";

export const SESSION_COOKIE = "dt_session";
export const REFRESH_COOKIE = "dt_refresh";
export const PROFILE_COOKIE = "dt_profile"; // display-only: an initial and optional avatar URL
export const PKCE_COOKIE = "dt_pkce";

export function authEnabled(): boolean {
  return authConfig() !== null;
}

type Verify = (token: string) => Promise<VerifiedPrincipal | null>;
const built: { verify: Verify | null } = { verify: null };

/** The session token verifier, built once sign-in is configured; null while it is not. */
function sessionVerifier(): Verify | null {
  if (built.verify) return built.verify;
  const config = authConfig();
  if (!config) return null;
  // Signed-in users share the public tenant with the anonymous secret-link flow.
  const adapter = new OidcAdapter({
    jwksUri: config.jwksUri,
    trustedIssuers: config.trustedIssuers,
    tenant: "public",
    // Bind the token to this app: a valid signature from the issuer is not enough, since the same
    // JWKS signs tokens minted for other clients/resources of that issuer. Providers that do not
    // stamp an audience leave AUTH_AUDIENCE unset and fall back to issuer-only trust.
    audience: setting("AUTH_AUDIENCE"),
  });
  // One person, one id, whichever of the provider's issuers signed the token (auth-config.ts).
  built.verify = canonicalVerifier((token) => adapter.verify(token), config);
  return built.verify;
}

/** The signed-in principal, or null. Fails closed on a missing, expired, or tampered cookie. */
export async function getSessionPrincipal(): Promise<VerifiedPrincipal | null> {
  return (await getSession())?.principal ?? null;
}

/**
 * The verified principal together with the token it was verified from, for the one call that needs
 * the token itself: userinfo, which answers only for the token's own subject.
 */
export async function getSession(): Promise<{ principal: VerifiedPrincipal; token: string } | null> {
  const verify = sessionVerifier();
  if (!verify) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const principal = await verify(token);
  return principal ? { principal, token } : null;
}

/**
 * Whether a session cookie is present, regardless of whether it verifies. Lets a page tell
 * "never signed in" (no cookie: send straight to sign-in) apart from "signed in but the token will
 * not verify" (cookie present: show a prompt, never a redirect loop).
 */
export async function hasSessionCookie(): Promise<boolean> {
  return (await cookies()).get(SESSION_COOKIE) !== undefined;
}

export interface DisplayProfile {
  initial: string;
  picture?: string;
}

/** Display-only identity for the nav avatar. Never used for authorization. */
export async function getDisplayProfile(): Promise<DisplayProfile | null> {
  const raw = (await cookies()).get(PROFILE_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DisplayProfile>;
    const initial = typeof parsed.initial === "string" && parsed.initial ? parsed.initial : "U";
    const picture = typeof parsed.picture === "string" ? parsed.picture : undefined;
    return { initial: initial.slice(0, 1).toUpperCase(), picture };
  } catch {
    return null;
  }
}

export interface TokenGrant {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  /** Some providers return a profile object beside the tokens; used only for the display avatar. */
  user?: { email?: string; first_name?: string; profile_picture_url?: string };
}

/** Exchange an authorization code (PKCE public client: no secret involved). */
export async function exchangeCode(code: string, codeVerifier: string): Promise<TokenGrant | null> {
  const config = authConfig();
  if (!config) return null;
  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      code,
      code_verifier: codeVerifier,
    }).toString(),
  });
  if (!res.ok) return null;
  const grant = (await res.json()) as Partial<TokenGrant>;
  return typeof grant.access_token === "string" ? (grant as TokenGrant) : null;
}

/**
 * Derive the display avatar from a token grant, provider-agnostically: a standard `id_token`'s
 * profile claims first, then a returned `user` object, else a generic fallback. Returns only an
 * initial and an optional picture URL, never anything sensitive.
 */
function idTokenClaims(idToken: string | undefined): Record<string, unknown> {
  if (!idToken) return {};
  try {
    return JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const asString = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

export function profileFromGrant(grant: TokenGrant): DisplayProfile {
  // Standard id_token profile claims first, then a returned user object as a fallback.
  const claims = idTokenClaims(grant.id_token);
  const user = grant.user ?? {};
  const name = asString(claims.name) ?? user.first_name;
  const email = asString(claims.email) ?? user.email;
  const picture = asString(claims.picture) ?? user.profile_picture_url;

  const initial = (name ?? email ?? "").trim().slice(0, 1).toUpperCase() || "U";
  return { initial, picture };
}
