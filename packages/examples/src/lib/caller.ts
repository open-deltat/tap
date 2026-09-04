import { headers } from "next/headers";

/**
 * A best-effort identity for rate limiting, and nothing else.
 *
 * A server action only ever sees request headers, never the socket address, so this trusts
 * `x-forwarded-for`. Behind our reverse proxy that header is rewritten and honest; reached
 * directly, a caller can forge a fresh value per request and walk straight past any per-caller cap.
 * That is why every public write also passes a site-wide limiter: this bounds the polite majority,
 * the site-wide bucket bounds the attacker. Never use this value for authorization.
 */
export async function callerIp(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}
