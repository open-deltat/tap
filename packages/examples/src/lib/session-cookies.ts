// The sign-in cookies, in a module with no request context so the proxy can share them with the app.

/** Cookies must not travel in cleartext outside local development. */
export const cookieSecure = process.env.NODE_ENV === "production";

export const SESSION_COOKIE = "dt_session";
/** The refresh token, sealed with SESSION_SECRET (session-refresh.ts). Absent without that secret. */
export const REFRESH_COOKIE = "dt_refresh";
export const PROFILE_COOKIE = "dt_profile"; // display-only: an initial and optional avatar URL
export const PKCE_COOKIE = "dt_pkce";
