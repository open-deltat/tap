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

  const verifier = randomBytes(48).toString("base64url");
  const state = randomBytes(16).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  const authorize = new URL(`${env.issuer}/oauth2/authorize`);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: env.clientId,
    redirect_uri: `${req.nextUrl.origin}/callback`,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();

  const res = NextResponse.redirect(authorize);
  res.cookies.set(PKCE_COOKIE, `${state}.${verifier}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
