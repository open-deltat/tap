import { authConfig, mcpAudience, mcpVerifier } from "./auth-config";
import { meetings } from "./meetings";
import { bookingPasses } from "./booking-passes-live";
import { myCalendars } from "./my-calendars-live";
import { publicRegistry } from "./public-registry";
import { publicBaseUrl } from "./public-base-url";
import { fetchVerifiedContact } from "./userinfo";
import { createRateLimiter } from "./rate-limit";
import { protectedResourceMetadata, type McpEndpointDeps } from "./mcp-endpoint";

// The hosted endpoint's production wiring. On only when both are configured: sign-in (AUTH_ISSUER,
// AUTH_CLIENT_ID), because every call acts as a verified person, and PUBLIC_BASE_URL, because the
// OAuth metadata must name this resource by the URL clients use, which request headers must not choose.
//
// Tokens are checked against the same issuer as the site's sign-in, and against AUTH_MCP_AUDIENCE once
// it is set; until then the audiences seen are logged so it can be set (mcpAudience, auth-config.ts).

const METADATA_PATH = "/.well-known/oauth-protected-resource/mcp";

function buildDeps(): McpEndpointDeps | null {
  const config = authConfig();
  if (!config || !publicBaseUrl) return null;
  return {
    // One person, one id, whichever of the provider's issuers signed the token: an MCP client's token
    // and the site's session come from different WorkOS issuers for the same user (auth-config.ts).
    verify: mcpVerifier(config, mcpAudience()),
    resourceMetadataUrl: `${publicBaseUrl}${METADATA_PATH}`,
    service: meetings,
    passes: bookingPasses,
    calendars: myCalendars,
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
      passes: bookingPasses,
      calendars: myCalendars,
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
