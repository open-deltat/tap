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
 */
export function canonicalPrincipalId(principalId: string, config: AuthConfig | null = authConfig()): string {
  const at = principalId.indexOf("#");
  if (!config || at < 0) return principalId;
  const iss = principalId.slice(0, at);
  return config.trustedIssuers.includes(iss) ? `${config.issuer}#${principalId.slice(at + 1)}` : principalId;
}
