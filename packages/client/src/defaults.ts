/**
 * Where the adapters (the MCP server, the CLI) connect when nothing says otherwise: a local deltat
 * and its default tenant. Stated once so the two cannot drift; packages/mcp/server.json documents
 * the same values for MCP clients and has to be kept in step by hand, being static JSON.
 *
 * Not the defaults of `new DeltaT()` itself, which predate the adapters and stay as they are.
 */
export const ADAPTER_DEFAULTS = { host: "localhost", port: 5433, database: "public", user: "user" } as const;
