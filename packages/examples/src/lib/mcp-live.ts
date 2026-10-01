import { OidcAdapter } from "@open-deltat/mcp";
import { authConfig, canonicalPrincipalId } from "./auth-config";
import { meetings } from "./meetings";
import { publicRegistry } from "./public-registry";
import { publicBaseUrl } from "./public-base-url";
import { fetchVerifiedContact } from "./userinfo";
import { createRateLimiter } from "./rate-limit";
import { protectedResourceMetadata, type McpEndpointDeps } from "./mcp-endpoint";

// The hosted endpoint's production wiring. On only when both are configured: sign-in (AUTH_ISSUER,
// AUTH_CLIENT_ID), because every call acts as a verified person, and PUBLIC_BASE_URL, because the
// OAuth metadata must name this resource by the URL clients use, which request headers must not choose.
//
// Tokens are checked against the same issuer as the site's sign-in. MCP clients register their own
// OAuth client with that issuer, so their tokens carry their own audience; AUTH_MCP_AUDIENCE binds
// them to one when the issuer stamps a resource audience, otherwise trust is issuer-wide, as for the
// site when AUTH_AUDIENCE is unset.

const METADATA_PATH = "/.well-known/oauth-protected-resource/mcp";

function buildDeps(): McpEndpointDeps | null {
  const config = authConfig();
  if (!config || !publicBaseUrl) return null;
  const adapter = new OidcAdapter({
    jwksUri: config.jwksUri,
    trustedIssuers: config.trustedIssuers,
    tenant: "public",
    audience: process.env.AUTH_MCP_AUDIENCE?.trim() || undefined,
  });
  return {
    // One person, one id, whichever of the provider's issuers signed the token: an MCP client's token
    // and the site's session come from different WorkOS issuers for the same user (auth-config.ts).
    verify: async (token) => {
      const principal = await adapter.verify(token);
      return principal && { ...principal, principalId: canonicalPrincipalId(principal.principalId, config) };
    },
    resourceMetadataUrl: `${publicBaseUrl}${METADATA_PATH}`,
    service: meetings,
    calendarOf: (id) => publicRegistry.get(id),
    contactFor: (token, principal) =>
      principal.sub
        ? fetchVerifiedContact(token, { userinfoUrl: config.userinfoUrl, expectedSub: principal.sub })
        : Promise.resolve(null),
    // A signed-in agent may be chatty; this bounds a runaway one, not a person.
    limiter: createRateLimiter({ limit: 600, windowMs: 3_600_000 }),
  };
}

const built: { deps: McpEndpointDeps | null | undefined } = { deps: undefined };

/** The endpoint's dependencies, built once. `verify: null` (endpoint off) when not configured. */
export function liveMcpDeps(): McpEndpointDeps {
  built.deps ??= buildDeps();
  return (
    built.deps ?? {
      verify: null,
      resourceMetadataUrl: "",
      service: meetings,
      calendarOf: () => undefined,
      contactFor: async () => null,
      limiter: createRateLimiter({ limit: 0, windowMs: 1 }),
    }
  );
}

/** The RFC 9728 document, or null when the endpoint is off. */
export function liveProtectedResourceMetadata() {
  const config = authConfig();
  return config && publicBaseUrl ? protectedResourceMetadata(publicBaseUrl, config.issuer) : null;
}
