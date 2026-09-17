import { NextResponse, type NextRequest } from "next/server";
import {
  PKCE_COOKIE,
  REFRESH_COOKIE,
  SESSION_COOKIE,
  exchangeCode,
} from "@open-deltat/examples/lib/workos-session";

// The OAuth callback: state check, code-for-token exchange (PKCE), session cookies, then /my.
// Tokens go into httpOnly cookies and are never rendered; verification happens offline on read.

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/my?error=${encodeURIComponent(reason)}`, url.origin));

  if (url.searchParams.get("error")) return fail(url.searchParams.get("error") ?? "denied");

  const pkce = req.cookies.get(PKCE_COOKIE)?.value;
  const code = url.searchParams.get("code");
  if (!pkce || !code) return fail("missing_flow_state");
  const [state, verifier] = pkce.split(".");
  if (!state || !verifier || url.searchParams.get("state") !== state) return fail("state_mismatch");

  const grant = await exchangeCode(code, verifier, `${url.origin}/callback`);
  if (!grant) return fail("exchange_failed");

  const res = NextResponse.redirect(new URL("/my", url.origin));
  res.cookies.delete(PKCE_COOKIE);
  res.cookies.set(SESSION_COOKIE, grant.access_token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: grant.expires_in ?? 300,
  });
  if (grant.refresh_token) {
    res.cookies.set(REFRESH_COOKIE, grant.refresh_token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }
  return res;
}
