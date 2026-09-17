import { NextResponse, type NextRequest } from "next/server";
import { REFRESH_COOKIE, SESSION_COOKIE } from "@open-deltat/examples/lib/workos-session";

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/", req.nextUrl.origin));
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(REFRESH_COOKIE);
  return res;
}
