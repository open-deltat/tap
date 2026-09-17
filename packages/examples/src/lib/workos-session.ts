import { cookies } from "next/headers";
import { WorkOSAdapter, type VerifiedPrincipal } from "@open-deltat/mcp";

// The web session over the same AuthAdapter the MCP server uses: the access token lives in an
// httpOnly cookie and every read verifies it OFFLINE against the issuer's cached JWKS. WorkOS is
// only touched at sign-in and token exchange, never per request.

export const SESSION_COOKIE = "dt_session";
export const REFRESH_COOKIE = "dt_refresh";
export const PKCE_COOKIE = "dt_pkce";

export function workosEnv(): { issuer: string; clientId: string } | null {
  const issuer = process.env.WORKOS_AUTHKIT_DOMAIN?.replace(/\/$/, "");
  const clientId = process.env.WORKOS_CLIENT_ID;
  return issuer && clientId ? { issuer, clientId } : null;
}

let adapter: WorkOSAdapter | null = null;
function getAdapter(): WorkOSAdapter | null {
  if (adapter) return adapter;
  const env = workosEnv();
  if (!env) return null;
  // Bookables created by signed-in users live in the same public tenant as the secret-link flow.
  adapter = new WorkOSAdapter({ issuer: env.issuer, tenant: "public" });
  return adapter;
}

/** The signed-in principal, or null. Fails closed on a missing, expired, or tampered cookie. */
export async function getSessionPrincipal(): Promise<VerifiedPrincipal | null> {
  const verify = getAdapter();
  if (!verify) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verify.verify(token);
}

export interface TokenGrant {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

/** Exchange an authorization code (PKCE public client: no secret involved). */
export async function exchangeCode(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<TokenGrant | null> {
  const env = workosEnv();
  if (!env) return null;
  const res = await fetch(`${env.issuer}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }).toString(),
  });
  if (!res.ok) return null;
  const grant = (await res.json()) as Partial<TokenGrant>;
  return typeof grant.access_token === "string" ? (grant as TokenGrant) : null;
}
