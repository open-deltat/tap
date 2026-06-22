import { NextRequest, NextResponse } from "next/server";
import { VISITOR_COOKIE, VISITOR_TTL_SECONDS } from "./lib/visitor";

export function proxy(req: NextRequest) {
  if (req.cookies.get(VISITOR_COOKIE)?.value) return NextResponse.next();

  const vid = crypto.randomUUID();
  // Set on the request too, so server actions in THIS first request already see it.
  req.cookies.set(VISITOR_COOKIE, vid);
  const res = NextResponse.next({ request: req });
  res.cookies.set(VISITOR_COOKIE, vid, {
    maxAge: VISITOR_TTL_SECONDS,
    path: "/",
    sameSite: "lax",
  });
  return res;
}

export const config = {
  matcher: ["/", "/demos/:path*"],
};
