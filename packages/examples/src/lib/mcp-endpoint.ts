import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { VerifiedPrincipal } from "@open-deltat/mcp";
import type { MeetingService } from "./meeting-request-service";
import type { RequestContact } from "./meeting-requests";
import type { RateLimiter } from "./rate-limit";
import { createMeetingsMcpServer, type CalendarLookup } from "./meetings-mcp";

// The hosted MCP endpoint (`/mcp`), as a plain Request -> Response function so it runs the same in a
// Next route handler, under Bun.serve, or in a test. OAuth 2.1 resource server per the MCP spec: a
// request without a valid bearer token gets 401 and a pointer to the protected-resource metadata
// (RFC 9728), from which a client finds the authorization server and signs the person in.
//
// Stateless: a fresh MCP server per request, bound to the verified caller. Nothing the server knows
// outlives the request, so there is no session to hijack and no state to share across replicas.

export interface McpEndpointDeps {
  /** Verifies a bearer token; null when sign-in is not configured, which switches the endpoint off. */
  verify: ((token: string) => Promise<VerifiedPrincipal | null>) | null;
  /** Absolute URL of this resource's metadata, e.g. https://delt.at/.well-known/oauth-protected-resource/mcp. */
  resourceMetadataUrl: string;
  service: MeetingService;
  calendarOf: CalendarLookup;
  /** The caller's name and email for a request, from the identity provider, with the caller's own token. */
  contactFor: (token: string, principal: VerifiedPrincipal) => Promise<RequestContact | null>;
  limiter: RateLimiter;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** The token from `Authorization: Bearer <token>`, scheme matched case-insensitively (RFC 6750). */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const space = header.indexOf(" ");
  if (space < 0 || header.slice(0, space).toLowerCase() !== "bearer") return null;
  const token = header.slice(space + 1).trim();
  return token.length > 0 ? token : null;
}

export async function handleMcpRequest(req: Request, deps: McpEndpointDeps): Promise<Response> {
  if (!deps.verify) return json(404, { error: "not_found" });
  // Only POST carries MCP messages here. GET would open a stream for server-initiated messages,
  // which this server never sends; 405 is the spec's way of saying so.
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, { allow: "POST" });

  const token = bearerToken(req.headers.get("authorization"));
  const principal = token ? await deps.verify(token) : null;
  if (!token || !principal) {
    const challenge = token
      ? `Bearer error="invalid_token", resource_metadata="${deps.resourceMetadataUrl}"`
      : `Bearer resource_metadata="${deps.resourceMetadataUrl}"`;
    return json(401, { error: "unauthorized", message: "Sign in to use this server." }, { "www-authenticate": challenge });
  }

  const gate = deps.limiter.check(principal.principalId);
  if (!gate.allowed) {
    return json(429, { error: "rate_limited" }, { "retry-after": String(Math.max(1, Math.ceil(gate.retryAfterMs / 1000))) });
  }

  const server = createMeetingsMcpServer(
    deps.service,
    { principalId: principal.principalId, contact: () => deps.contactFor(token, principal) },
    deps.calendarOf
  );
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    // JSON responses: the reply is complete when handleRequest resolves, so closing after is safe.
    return await transport.handleRequest(req);
  } finally {
    await server.close();
  }
}

/** RFC 9728 metadata for this resource: which authorization server signs callers in. */
export function protectedResourceMetadata(base: string, issuer: string) {
  return {
    resource: `${base}/mcp`,
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
    scopes_supported: ["openid", "profile", "email"],
    resource_name: "deltat meeting requests",
  };
}
