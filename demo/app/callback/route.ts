import { NextResponse, type NextRequest } from "next/server";
import {
  CONTACT_COOKIE,
  PKCE_COOKIE,
  PROFILE_COOKIE,
  REFRESH_COOKIE,
  SESSION_COOKIE,
  authConfig,
  contactCookieValue,
  cookieSecure,
  exchangeCode,
  profileFromGrant,
  safeReturnTo,
} from "@open-deltat/examples/lib/auth-session";
import { siteOrigin } from "@open-deltat/examples/lib/public-base-url";
import { liveRefreshDeps } from "@open-deltat/examples/lib/session-refresh-live";
import { SESSION_LIFETIME_MS, sealRefresh } from "@open-deltat/examples/lib/session-refresh";

// The OIDC callback: state check, code-for-token exchange (PKCE), session cookies, then the
// post-login destination. Tokens go into httpOnly cookies and are never rendered; verification
// happens offline on read. A display-only avatar cookie is set separately.

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  // Every redirect goes to the public origin: behind the proxy the request's own is localhost:3000.
  const origin = siteOrigin(url.origin);
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/dashboard?error=${encodeURIComponent(reason)}`, origin));

  if (!authConfig()) return NextResponse.redirect(new URL("/", origin));
  if (url.searchParams.get("error")) return fail(url.searchParams.get("error") ?? "denied");

  const pkce = req.cookies.get(PKCE_COOKIE)?.value;
  const code = url.searchParams.get("code");
  if (!pkce || !code) return fail("missing_flow_state");
  const [state, verifier, returnToRaw] = pkce.split(".");
  if (!state || !verifier || url.searchParams.get("state") !== state) return fail("state_mismatch");
  const returnTo = safeReturnTo(returnToRaw);

  const grant = await exchangeCode(code, verifier);
  if (!grant) return fail("exchange_failed");

  const res = NextResponse.redirect(new URL(returnTo, origin));
  res.cookies.delete(PKCE_COOKIE);
  res.cookies.set(SESSION_COOKIE, grant.access_token, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: grant.expires_in ?? 300,
  });
  // The refresh token is what keeps the session past the access token's few minutes: the proxy trades
  // it for a fresh one (session-refresh.ts). Stored only sealed under SESSION_SECRET; without that
  // secret it is dropped, as before, and the session ends with the access token.
  const deps = await liveRefreshDeps();
  if (deps && typeof grant.refresh_token === "string" && grant.refresh_token !== "") {
    res.cookies.set(REFRESH_COOKIE, await sealRefresh(deps.key, { refreshToken: grant.refresh_token, startedAt: Date.now() }), {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SESSION_LIFETIME_MS / 1000),
    });
  }
  // The person's name and email from the grant, so forms can start filled in without asking userinfo,
  // which does not answer for this session's token (it is the User Management API's, not AuthKit's).
  // httpOnly and bound to the token's subject; it lives as long as a session can.
  const contact = contactCookieValue(grant);
  if (contact) {
    res.cookies.set(CONTACT_COOKIE, contact, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SESSION_LIFETIME_MS / 1000),
    });
  }
  //
  // Display-only, readable by the server-rendered nav to draw the avatar. Carries just an initial
  // and an optional picture URL, never a token or anything sensitive.
  res.cookies.set(PROFILE_COOKIE, JSON.stringify(profileFromGrant(grant)), {
    httpOnly: false,
    secure: cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
