import { cookies } from "next/headers";

const COOKIE = "tap_vid";

/**
 * The demo-visitor's session id (minted by middleware). It does NOT isolate resources — every
 * visitor shares the same seeded examples — it only groups the bookings a visitor makes this
 * session, so the sidebar can show "your bookings" and the reaper can auto-clear them.
 */
export async function getSessionId(): Promise<string | null> {
  return (await cookies()).get(COOKIE)?.value ?? null;
}
