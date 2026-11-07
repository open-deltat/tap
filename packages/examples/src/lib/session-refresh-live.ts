import { authConfig, setting } from "./auth-config";
import { importSessionKey, type RefreshDeps } from "./session-refresh";

// The production wiring for silent refresh, built once per process: SESSION_SECRET normalised here,
// the token URL and client id from the sign-in config. With sign-in on and no usable secret, it says
// so once and refresh stays off, so a deploy without the variable signs people in exactly as before.

const shared = globalThis as typeof globalThis & { __deltatRefreshDeps?: Promise<RefreshDeps | null> };

async function build(): Promise<RefreshDeps | null> {
  const config = authConfig();
  if (!config) return null;
  const key = await importSessionKey(setting("SESSION_SECRET"));
  if (!key) {
    console.warn(
      "[auth] SESSION_SECRET is unset or not 32 bytes of base64: sessions end when the access token does (no silent refresh)."
    );
    return null;
  }
  return { key, tokenUrl: config.tokenUrl, clientId: config.clientId, fetch, now: Date.now };
}

/** The refresh dependencies, or null when sign-in or SESSION_SECRET is missing. */
export function liveRefreshDeps(): Promise<RefreshDeps | null> {
  return (shared.__deltatRefreshDeps ??= build());
}
