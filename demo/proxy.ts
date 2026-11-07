import type { NextRequest } from "next/server";
import { VISITOR_COOKIE, VISITOR_TTL_SECONDS } from "@open-deltat/examples/lib/visitor";
import { withFreshSession } from "@open-deltat/examples/lib/session-proxy";
import { liveRefreshDeps } from "@open-deltat/examples/lib/session-refresh-live";

// Two jobs before a page or server action runs: give the demos a visitor id, and keep a signed-in
// person's session fresh (session-proxy.ts), so a server action such as a hold sees a live session.

const needsVisitor = (req: NextRequest): boolean => {
  const path = req.nextUrl.pathname;
  return (path === "/" || path === "/demos" || path.startsWith("/demos/")) && !req.cookies.get(VISITOR_COOKIE)?.value;
};

export async function proxy(req: NextRequest) {
  return withFreshSession(req, await liveRefreshDeps(), (request) => {
    if (!needsVisitor(request)) return () => {};
    const vid = crypto.randomUUID();
    // Set on the request too, so server actions in THIS first request already see it.
    request.cookies.set(VISITOR_COOKIE, vid);
    return (res) => {
      res.cookies.set(VISITOR_COOKIE, vid, { maxAge: VISITOR_TTL_SECONDS, path: "/", sameSite: "lax" });
    };
  });
}

export const config = {
  // The demos for the visitor id; anything else only when it carries a refresh cookie, so a
  // signed-out visitor's requests never pass through here.
  matcher: ["/", "/demos/:path*", { source: "/:path*", has: [{ type: "cookie", key: "dt_refresh" }] }],
};
