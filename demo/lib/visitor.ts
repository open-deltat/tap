/**
 * The opaque per-visitor cookie, minted by middleware. It does NOT isolate resources (every
 * visitor shares the same seeded examples); it only groups the bookings a visitor makes this
 * session so the sidebar can show "your bookings" and the reaper can auto-clear them.
 */
export const VISITOR_COOKIE = "tap_vid";
export const VISITOR_TTL_SECONDS = 10 * 60;
