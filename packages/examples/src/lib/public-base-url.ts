/**
 * The site's public origin, e.g. `https://delt.at`, from PUBLIC_BASE_URL. Normalised once, here:
 * trimmed, blank means unset, only http(s), reduced to its origin. It names the site in the links an
 * owner's notification carries and in the MCP endpoint's OAuth metadata, where a value derived from
 * request headers would let a caller choose it.
 */
export function publicBaseUrlFrom(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value || !URL.canParse(value)) return null;
  const url = new URL(value);
  return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
}

export const publicBaseUrl = publicBaseUrlFrom(process.env.PUBLIC_BASE_URL);
