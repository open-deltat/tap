import { afterEach, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { VerifiedPrincipal } from "@open-deltat/mcp";
import { bearerToken, handleMcpRequest, protectedResourceMetadata, type McpEndpointDeps } from "../mcp-endpoint";
import { createRateLimiter } from "../rate-limit";
import { ANNA, OWNER, T, annaContact, setupMeetings } from "./meeting-fixtures";

// The hosted endpoint as Claude meets it: the MCP SDK's own HTTP client against the handler served
// over real HTTP. Token verification is faked (the OidcAdapter has its own tests); everything past
// it is the production path.

const METADATA_URL = "https://delt.at/.well-known/oauth-protected-resource/mcp";
const principals: Record<string, VerifiedPrincipal> = {
  anna: { principalId: ANNA, tenant: "public", scopes: [], iss: "https://issuer.test", sub: "anna" },
  owner: { principalId: OWNER, tenant: "public", scopes: [], iss: "https://issuer.test", sub: "owner" },
  nameless: { principalId: "https://issuer.test#nameless", tenant: "public", scopes: [], iss: "https://issuer.test", sub: "nameless" },
};

function endpoint(overrides: Partial<McpEndpointDeps> = {}) {
  const meetings = setupMeetings();
  const deps: McpEndpointDeps = {
    verify: async (token) => principals[token] ?? null,
    resourceMetadataUrl: METADATA_URL,
    service: meetings.service,
    calendarOf: (id) => meetings.registry.get(id),
    contactFor: async (_token, principal) => (principal.sub === "anna" ? annaContact : null),
    limiter: createRateLimiter({ limit: 1_000, windowMs: 60_000 }),
    ...overrides,
  };
  return { deps, meetings };
}

const servers: { stop: (force?: boolean) => void }[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.stop(true);
});

/** Serve the handler and connect an MCP client with `token`, the way a signed-in Claude would. */
async function connect(deps: McpEndpointDeps, token: string) {
  const server = Bun.serve({ port: 0, fetch: (req) => handleMcpRequest(req, deps) });
  servers.push(server);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://localhost:${server.port}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    })
  );
  return client;
}

const call = async (client: Client, name: string, args: Record<string, unknown>) => {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text: string }[];
  return { isError: result.isError === true, body: JSON.parse(content[0]?.text ?? "null") as Record<string, unknown> };
};

const post = (headers: Record<string, string> = {}) =>
  new Request("https://delt.at/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });

describe("who gets in", () => {
  test("no token: 401 pointing at the metadata, so a client knows where to sign the person in", async () => {
    const res = await handleMcpRequest(post(), endpoint().deps);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(`Bearer resource_metadata="${METADATA_URL}"`);
  });

  test("a token that does not verify: 401 saying so", async () => {
    const res = await handleMcpRequest(post({ authorization: "Bearer forged" }), endpoint().deps);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  test("sign-in not configured: the endpoint does not exist", async () => {
    expect((await handleMcpRequest(post({ authorization: "Bearer anna" }), endpoint({ verify: null }).deps)).status).toBe(404);
  });

  test("GET is refused with 405: this server never pushes messages", async () => {
    const res = await handleMcpRequest(new Request("https://delt.at/mcp", { headers: { authorization: "Bearer anna" } }), endpoint().deps);
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  });

  test("a signed-in caller over the limit gets 429 with a Retry-After", async () => {
    const { deps } = endpoint({ limiter: createRateLimiter({ limit: 1, windowMs: 60_000 }) });
    await handleMcpRequest(post({ authorization: "Bearer anna" }), deps);
    const res = await handleMcpRequest(post({ authorization: "Bearer anna" }), deps);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  test("the bearer scheme is read case-insensitively and nothing else counts as a token", () => {
    expect(bearerToken("Bearer abc")).toBe("abc");
    expect(bearerToken("bearer abc")).toBe("abc");
    for (const header of [null, "", "Bearer", "Bearer   ", "Basic abc", "abc"]) expect(bearerToken(header)).toBeNull();
  });

  test("the metadata names this resource and the issuer that signs people in", () => {
    expect(protectedResourceMetadata("https://delt.at", "https://auth.example")).toMatchObject({
      resource: "https://delt.at/mcp",
      authorization_servers: ["https://auth.example"],
    });
  });
});

describe("asking for and answering a meeting through MCP", () => {
  test("offers exactly the meeting tools, each described for a model to pick correctly", async () => {
    const client = await connect(endpoint().deps, "anna");
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "approve_meeting_request",
      "decline_meeting_request",
      "find_meeting_times",
      "list_meeting_requests",
      "my_meeting_requests",
      "request_meeting",
      "withdraw_meeting_request",
    ]);
    for (const tool of tools) {
      expect(tool.description?.startsWith("Use this")).toBe(true);
      expect(tool.description?.length ?? 0).toBeGreaterThan(80);
    }
  });

  test("a caller finds a time and asks; the owner sees who asked and approves; the caller sees it booked", async () => {
    const { deps, meetings } = endpoint();
    const anna = await connect(deps, "anna");
    const owner = await connect(deps, "owner");
    const start = new Date(T).toISOString();

    const found = await call(anna, "find_meeting_times", { calendar_id: "cal1", from: start, to: new Date(T + 3_600_000).toISOString() });
    expect(found.isError).toBe(false);
    expect(found.body).toMatchObject({ calendar: "Simon's week", slot_minutes: 30 });

    const asked = await call(anna, "request_meeting", { calendar_id: "cal1", start, note: "Coffee?" });
    expect(asked.isError).toBe(false);
    expect(asked.body).toMatchObject({ status: "pending", booked: false });
    expect(meetings.state.holds).toEqual([]);

    const inbox = await call(owner, "list_meeting_requests", { calendar_id: "cal1" });
    expect(inbox.body.requests).toEqual([expect.objectContaining({ requested_by: annaContact, note: "Coffee?" })]);

    // Anna cannot answer her own request on someone else's calendar, nor read its inbox.
    expect((await call(anna, "approve_meeting_request", { request_id: asked.body.request_id })).isError).toBe(true);
    expect((await call(anna, "list_meeting_requests", { calendar_id: "cal1" })).isError).toBe(true);

    const approved = await call(owner, "approve_meeting_request", { request_id: asked.body.request_id });
    expect(approved.body).toMatchObject({ status: "approved", booked: true });
    expect(meetings.state.bookings).toEqual([{ id: "booking1", label: "Anna Example" }]);

    const mine = await call(anna, "my_meeting_requests", {});
    expect(mine.body.requests).toEqual([expect.objectContaining({ status: "approved" })]);
    expect(JSON.stringify(mine.body)).not.toContain("requested_by"); // a requester's view carries no contact
  });

  test("a caller whose sign-in shared no name is asked for one instead of sending an anonymous request", async () => {
    const { deps } = endpoint();
    const client = await connect(deps, "nameless");
    const iso = new Date(T).toISOString();
    const refused = await call(client, "request_meeting", { calendar_id: "cal1", start: iso });
    expect(refused.isError).toBe(true);
    expect(String(refused.body.message)).toContain("your_name");
    const asked = await call(client, "request_meeting", { calendar_id: "cal1", start: iso, your_name: "Ben" });
    expect(asked.body).toMatchObject({ status: "pending" });
  });
});
