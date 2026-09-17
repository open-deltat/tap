import { NextResponse, type NextRequest } from "next/server";
import {
  PROFILE_COOKIE,
  REFRESH_COOKIE,
  SESSION_COOKIE,
} from "@open-deltat/examples/lib/auth-session";

// POST only: signing out mutates state, so a GET would let a third-party <img> or link force a
// visitor to sign out (CSRF). The same-origin form + SameSite=Lax cookies make the POST safe.
export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/", req.nextUrl.origin), { status: 303 });
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(REFRESH_COOKIE);
  res.cookies.delete(PROFILE_COOKIE);
  return res;
}
