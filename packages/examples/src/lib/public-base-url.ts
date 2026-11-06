/**
 * The site's public origin, e.g. `https://delt.at`, from PUBLIC_BASE_URL. Normalised once, here:
 * trimmed, blank means unset, only http(s), reduced to its origin. It names the site in the links an
 * owner's notification carries, in the MCP endpoint's OAuth metadata, and in the sign-in redirects,
 * where the request's own origin is wrong behind a proxy (the app sees its internal localhost:3000)
 * and, derived from headers, would let a caller choose it.
 */
export function publicBaseUrlFrom(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value || !URL.canParse(value)) return null;
  const url = new URL(value);
  return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
}

export const publicBaseUrl = publicBaseUrlFrom(process.env.PUBLIC_BASE_URL);

/**
 * The origin to send people back to: the configured public one, else the request's own. The fallback
 * is right only when the app is reached directly, as in local development. Read when called, not when
 * the module loads, so what a sign-in redirect uses never depends on which code loaded this first.
 */
export function siteOrigin(requestOrigin: string, base: string | null = publicBaseUrlFrom(process.env.PUBLIC_BASE_URL)): string {
  return base ?? requestOrigin;
}
