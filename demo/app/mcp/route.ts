import { handleMcpRequest } from "@open-deltat/examples/lib/mcp-endpoint";
import { liveMcpDeps } from "@open-deltat/examples/lib/mcp-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The hosted MCP endpoint: meeting requests for agents, signed in through the site's own identity
 * provider. Off (404) unless sign-in and PUBLIC_BASE_URL are configured; see lib/mcp-live.ts. The
 * handler answers every method itself (POST carries MCP, anything else is 405), so all three are
 * routed to it rather than leaving GET and DELETE to the framework.
 */
async function handle(req: Request): Promise<Response> {
  return handleMcpRequest(req, liveMcpDeps());
}

export { handle as GET, handle as POST, handle as DELETE };
