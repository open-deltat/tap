import { GET as metadata } from "./mcp/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Clients that look for the metadata at the root, without the resource's path, get the same document.
export async function GET(): Promise<Response> {
  return metadata();
}
