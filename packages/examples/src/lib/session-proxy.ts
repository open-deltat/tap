import { NextResponse, type NextRequest } from "next/server";
import { refreshSession, type RefreshDeps } from "./session-refresh";
import { REFRESH_COOKIE, SESSION_COOKIE, cookieSecure } from "./session-cookies";

/**
 * Bring this request's session up to date before the page or server action behind it runs.
 *
 * A refreshed token is written into the request itself as well as the response, so the server action
 * in THIS request (a hold, say) already reads the fresh session, not the one that just expired. A
 * failed refresh clears both cookies on both sides: the request runs signed out and the browser
 * forgets them, so the next request has nothing to retry. `prepare` lets the caller add its own
 * request cookies (the visitor id) before the response is built from the request.
 */
export async function withFreshSession(
  req: NextRequest,
  deps: RefreshDeps | null,
  prepare: (req: NextRequest) => (res: NextResponse) => void = () => () => {}
): Promise<NextResponse> {
  const decision = deps
    ? await refreshSession(deps, { session: req.cookies.get(SESSION_COOKIE)?.value, refresh: req.cookies.get(REFRESH_COOKIE)?.value })
    : ({ kind: "keep" } as const);

  if (decision.kind === "refreshed") {
    req.cookies.set(SESSION_COOKIE, decision.session);
    req.cookies.set(REFRESH_COOKIE, decision.refresh);
  } else if (decision.kind === "signed-out") {
    req.cookies.delete(SESSION_COOKIE);
    req.cookies.delete(REFRESH_COOKIE);
  }
  const finish = prepare(req);
  const res = NextResponse.next({ request: req });

  const base = { httpOnly: true, secure: cookieSecure, sameSite: "lax" as const, path: "/" };
  if (decision.kind === "refreshed") {
    res.cookies.set(SESSION_COOKIE, decision.session, { ...base, maxAge: decision.sessionMaxAgeSeconds });
    res.cookies.set(REFRESH_COOKIE, decision.refresh, { ...base, maxAge: decision.refreshMaxAgeSeconds });
  } else if (decision.kind === "signed-out") {
    res.cookies.delete(SESSION_COOKIE);
    res.cookies.delete(REFRESH_COOKIE);
  }
  finish(res);
  return res;
}
