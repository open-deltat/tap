import { NextResponse, type NextRequest } from "next/server";
import {
  PKCE_COOKIE,
  PROFILE_COOKIE,
  SESSION_COOKIE,
  authConfig,
  exchangeCode,
  profileFromGrant,
} from "@open-deltat/examples/lib/auth-session";

// The OIDC callback: state check, code-for-token exchange (PKCE), session cookies, then the
// post-login destination. Tokens go into httpOnly cookies and are never rendered; verification
// happens offline on read. A display-only avatar cookie is set separately.

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/dashboard?error=${encodeURIComponent(reason)}`, url.origin));

  if (!authConfig()) return NextResponse.redirect(new URL("/", url.origin));
  if (url.searchParams.get("error")) return fail(url.searchParams.get("error") ?? "denied");

  const pkce = req.cookies.get(PKCE_COOKIE)?.value;
  const code = url.searchParams.get("code");
  if (!pkce || !code) return fail("missing_flow_state");
  const [state, verifier, returnToRaw] = pkce.split(".");
  if (!state || !verifier || url.searchParams.get("state") !== state) return fail("state_mismatch");
  const returnTo = returnToRaw?.startsWith("/") && !returnToRaw.startsWith("//") ? returnToRaw : "/dashboard";

  const grant = await exchangeCode(code, verifier);
  if (!grant) return fail("exchange_failed");

  const res = NextResponse.redirect(new URL(returnTo, url.origin));
  res.cookies.delete(PKCE_COOKIE);
  res.cookies.set(SESSION_COOKIE, grant.access_token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: grant.expires_in ?? 300,
  });
  // The refresh token is deliberately NOT persisted: nothing consumes it yet, and a long-lived
  // credential at rest with no use is pure liability. When a silent-refresh flow is added, store it
  // then. For now a session simply ends when the access token expires.
  //
  // Display-only, readable by the server-rendered nav to draw the avatar. Carries just an initial
  // and an optional picture URL, never a token or anything sensitive.
  res.cookies.set(PROFILE_COOKIE, JSON.stringify(profileFromGrant(grant)), {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
