import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { PKCE_COOKIE, workosEnv } from "@open-deltat/examples/lib/workos-session";

// Kicks off the AuthKit sign-in: PKCE (public client, no secret anywhere in this app), state for
// CSRF, both stashed in one short-lived httpOnly cookie the callback consumes.

export async function GET(req: NextRequest) {
  const env = workosEnv();
  if (!env) {
    return new NextResponse("Sign-in is not configured (WORKOS_* env missing).", { status: 503 });
  }

  // Where to land after sign-in. Only same-origin app paths are honored, so a crafted ?returnTo
  // cannot turn the callback into an open redirect.
  const requested = req.nextUrl.searchParams.get("returnTo") ?? "/dashboard";
  const returnTo = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";

  const verifier = randomBytes(48).toString("base64url");
  const state = randomBytes(16).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  // First-party AuthKit flow (see exchangeCode in workos-session.ts for why not /oauth2/authorize).
  const authorize = new URL("https://api.workos.com/user_management/authorize");
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: env.clientId,
    provider: "authkit",
    redirect_uri: `${req.nextUrl.origin}/callback`,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();

  const res = NextResponse.redirect(authorize);
  // state, verifier, and the post-login destination travel together in one short-lived cookie the
  // callback consumes. returnTo is last and its charset (an app path) cannot contain the delimiter.
  res.cookies.set(PKCE_COOKIE, `${state}.${verifier}.${returnTo}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
