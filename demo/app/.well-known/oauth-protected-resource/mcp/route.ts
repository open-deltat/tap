import { liveProtectedResourceMetadata } from "@open-deltat/examples/lib/mcp-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * RFC 9728 protected-resource metadata for /mcp, at the path the RFC derives from the resource URL.
 * An MCP client reads it after a 401 to find the authorization server that signs the person in.
 */
export async function GET(): Promise<Response> {
  const metadata = liveProtectedResourceMetadata();
  return metadata ? Response.json(metadata) : Response.json({ error: "not_found" }, { status: 404 });
}
