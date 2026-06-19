import { NextRequest, NextResponse } from "next/server";

// Mint an opaque per-visitor session id. It does NOT isolate resources — every visitor shares
// the same seeded examples — it only groups the bookings a visitor makes this session so the
// sidebar can show "your bookings" and the reaper can auto-clear them after 30s.
const COOKIE = "tap_vid";
const TTL_SECONDS = 10 * 60;

export function proxy(req: NextRequest) {
  if (req.cookies.get(COOKIE)?.value) return NextResponse.next();

  const vid = crypto.randomUUID();
  // Set on the request too, so server actions in THIS first request already see it.
  req.cookies.set(COOKIE, vid);
  const res = NextResponse.next({ request: req });
  res.cookies.set(COOKIE, vid, {
    maxAge: TTL_SECONDS,
    path: "/",
    sameSite: "lax",
  });
  return res;
}

export const config = {
  matcher: ["/", "/demos/:path*"],
};
