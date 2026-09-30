import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { PKCE_COOKIE, authConfig, cookieSecure, safeReturnTo } from "@open-deltat/examples/lib/auth-session";

// Kicks off sign-in against the configured OIDC issuer: PKCE (public client, no secret in this
// app), state for CSRF, both stashed in one short-lived httpOnly cookie the callback consumes.
// 404s when no issuer is configured, so a bare open-source clone has no dangling auth route.

export async function GET(req: NextRequest) {
  const config = authConfig();
  if (!config) return new NextResponse("Sign-in is not enabled on this instance.", { status: 404 });

  const returnTo = safeReturnTo(req.nextUrl.searchParams.get("returnTo"));

  const verifier = randomBytes(48).toString("base64url");
  const state = randomBytes(16).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  const authorize = new URL(config.authorizeUrl);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: `${req.nextUrl.origin}/callback`,
    scope: "openid profile email",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    ...config.extraAuthorizeParams,
  }).toString();

  const res = NextResponse.redirect(authorize);
  res.cookies.set(PKCE_COOKIE, `${state}.${verifier}.${returnTo}`, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
