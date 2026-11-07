import { OidcAdapter, type VerifiedPrincipal } from "@open-deltat/mcp";
import { decodeJwt } from "jose";
import { liveIdentityLinks, type IdentityLinks } from "./identity-links";

// The sign-in configuration and the one identity a person has under it. Pure (no request context),
// so the custom server (server.ts) can use it as well as the Next app: the registry it loads must
// read owners the same way the app writes them.
//
// Required to enable: AUTH_ISSUER, AUTH_CLIENT_ID.
// Optional overrides (for providers whose endpoints are not at the OIDC defaults):
//   AUTH_AUTHORIZE_URL, AUTH_TOKEN_URL, AUTH_JWKS_URI, AUTH_USERINFO_URL,
//   AUTH_TRUSTED_ISSUERS (comma-separated: further issuer strings of the SAME identity provider).

export interface AuthConfig {
  issuer: string;
  clientId: string;
  authorizeUrl: string;
  tokenUrl: string;
  jwksUri: string;
  /** OIDC userinfo, for the name and email a meeting request shows its owner. */
  userinfoUrl: string;
  trustedIssuers: string[];
  /** Optional extra query param some providers require on /authorize, e.g. `provider=authkit`. */
  extraAuthorizeParams: Record<string, string>;
}

/**
 * One AUTH_* setting: trimmed, and blank counts as unset. Compose passes an unset variable through as
 * an empty string, which `??` would take as a value and use in place of the default.
 */
export const setting = (name: string): string | undefined => process.env[name]?.trim() || undefined;

/** The auth config, or null when this instance has no sign-in configured. */
export function authConfig(): AuthConfig | null {
  const issuer = setting("AUTH_ISSUER")?.replace(/\/$/, "");
  const clientId = setting("AUTH_CLIENT_ID");
  if (!issuer || !clientId) return null;

  const extraIssuers = setting("AUTH_TRUSTED_ISSUERS")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

  const provider = setting("AUTH_PROVIDER_PARAM");

  return {
    issuer,
    clientId,
    authorizeUrl: setting("AUTH_AUTHORIZE_URL") ?? `${issuer}/oauth2/authorize`,
    tokenUrl: setting("AUTH_TOKEN_URL") ?? `${issuer}/oauth2/token`,
    jwksUri: setting("AUTH_JWKS_URI") ?? `${issuer}/oauth2/jwks`,
    userinfoUrl: setting("AUTH_USERINFO_URL") ?? `${issuer}/oauth2/userinfo`,
    trustedIssuers: [issuer, ...extraIssuers],
    extraAuthorizeParams: provider ? { provider } : {},
  };
}

/**
 * The one id a person has here, whichever trusted issuer signed their token: `AUTH_ISSUER#sub`.
 *
 * Every trusted issuer is an issuer string of the same identity provider (that is what listing it in
 * AUTH_TRUSTED_ISSUERS means), and one provider gives a person one subject. WorkOS shows why this
 * matters: the site's sign-in gets tokens from its User Management API, an MCP client's sign-in gets
 * them from its AuthKit OAuth server, and the two carry different `iss` values for the same user. Keyed
 * by the raw `iss#sub`, the same Google account was two people, and a calendar's owner was refused
 * its own inbox through MCP.
 *
 * An id from an issuer outside the trusted set is returned unchanged; it never verified anyway. The id
 * is split at its first "#", which is safe because an OIDC `iss` is a URL without a fragment.
 *
 * Then the identity's link, if it has one (identity-links.ts): after an identity provider move, the
 * new identity acts as the principal its records were stored under. Stored ids pass through here on
 * load too; they are principals, never link keys, so they come back unchanged.
 */
export function canonicalPrincipalId(
  principalId: string,
  config: AuthConfig | null = authConfig(),
  links: IdentityLinks = liveIdentityLinks()
): string {
  const at = principalId.indexOf("#");
  if (!config || at < 0) return principalId;
  const iss = principalId.slice(0, at);
  const identity = config.trustedIssuers.includes(iss) ? `${config.issuer}#${principalId.slice(at + 1)}` : principalId;
  return links.get(identity) ?? identity;
}

/**
 * A token verifier that answers with that one id. The site's session (auth-session.ts) and the hosted
 * MCP endpoint (mcp-live.ts) both verify through this, so a person is the same person on either, and
 * the test that signs real tokens from two issuers exercises exactly what production runs.
 */
export function canonicalVerifier(
  verify: (token: string) => Promise<VerifiedPrincipal | null>,
  config: AuthConfig,
  /** Omitted: this process's links file. */
  links?: IdentityLinks
): (token: string) => Promise<VerifiedPrincipal | null> {
  return async (token) => {
    const principal = await verify(token);
    return principal && { ...principal, principalId: canonicalPrincipalId(principal.principalId, config, links) };
  };
}

/**
 * The audience a token must carry at /mcp: AUTH_MCP_AUDIENCE, normalised once here (trimmed, blank
 * means unset). A resource server should only take tokens minted for it, but nobody has seen what
 * audience live MCP tokens carry, and a guessed value would refuse every MCP client on deploy. So:
 *
 *   - Set: enforced. A token for any other audience, or none, is refused.
 *   - Unset: tokens are accepted as before (issuer, signature, expiry), and each verified token's
 *     audience is logged once per distinct value: `[mcp] token audience seen: "<aud>"`.
 *
 * Operator steps: deploy, let an MCP client sign in, read the logged audience in the Coolify logs,
 * set AUTH_MCP_AUDIENCE to it, redeploy. If that value is one environment-wide audience rather than
 * this resource (WorkOS stamps one when the resource is not registered with it), registering
 * `${PUBLIC_BASE_URL}/mcp` as a resource in WorkOS gives a tighter one; read the log again after.
 *
 * The site's session audience (AUTH_AUDIENCE) is not refused here while this is unset: nothing in the
 * code or tests proves MCP tokens never carry it, and refusing it on a guess is the lockout this
 * avoids. Website sessions are unaffected either way; they verify with AUTH_AUDIENCE.
 */
export function mcpAudience(): string | undefined {
  return setting("AUTH_MCP_AUDIENCE");
}

/** How many distinct audiences are logged before going quiet: a bound, not an expected number. */
const MAX_LOGGED_AUDIENCES = 20;

/**
 * The /mcp token verifier: the issuer's signature, the MCP audience when one is set, and the one id
 * a person has. Unset, it logs the audiences it sees (mcpAudience), and only for tokens that
 * verified, so nobody without a valid token can write to the log.
 */
export function mcpVerifier(
  config: AuthConfig,
  audience: string | undefined,
  opts: { links?: IdentityLinks; log?: (line: string) => void } = {}
): (token: string) => Promise<VerifiedPrincipal | null> {
  const adapter = new OidcAdapter({ jwksUri: config.jwksUri, trustedIssuers: config.trustedIssuers, tenant: "public", audience });
  const verify = canonicalVerifier((token) => adapter.verify(token), config, opts.links);
  if (audience !== undefined) return verify;

  const log = opts.log ?? console.log;
  const seen = new Set<string>();
  return async (token) => {
    const principal = await verify(token);
    if (principal) {
      const aud = decodeJwt(token).aud;
      const values = aud === undefined ? [] : typeof aud === "string" ? [aud] : aud;
      values
        .filter((value) => !seen.has(value) && seen.size < MAX_LOGGED_AUDIENCES)
        .forEach((value) => {
          seen.add(value);
          // JSON-quoted, so a value cannot forge a second log line.
          log(`[mcp] token audience seen: ${JSON.stringify(value)}`);
        });
    }
    return principal;
  };
}
