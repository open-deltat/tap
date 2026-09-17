import { NextResponse, type NextRequest } from "next/server";
import {
  PROFILE_COOKIE,
  REFRESH_COOKIE,
  SESSION_COOKIE,
} from "@open-deltat/examples/lib/auth-session";

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/", req.nextUrl.origin));
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(REFRESH_COOKIE);
  res.cookies.delete(PROFILE_COOKIE);
  return res;
}
