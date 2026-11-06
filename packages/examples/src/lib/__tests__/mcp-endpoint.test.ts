import { afterEach, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { VerifiedPrincipal } from "@open-deltat/mcp";
import { bearerToken, handleMcpRequest, protectedResourceMetadata, type McpEndpointDeps } from "../mcp-endpoint";
import { createRateLimiter } from "../rate-limit";
import { ANNA, OWNER, T, annaContact } from "./meeting-fixtures";
import { STRANGER, setupPasses } from "./pass-fixtures";
import { PASS_NOT_VALID } from "../booking-pass-service";

// The hosted endpoint as Claude meets it: the MCP SDK's own HTTP client against the handler served
// over real HTTP. Token verification is faked (the OidcAdapter has its own tests); everything past
// it is the production path.

const METADATA_URL = "https://delt.at/.well-known/oauth-protected-resource/mcp";
const principals: Record<string, VerifiedPrincipal> = {
  anna: { principalId: ANNA, tenant: "public", scopes: [], iss: "https://issuer.test", sub: "anna" },
  owner: { principalId: OWNER, tenant: "public", scopes: [], iss: "https://issuer.test", sub: "owner" },
  nameless: { principalId: "https://issuer.test#nameless", tenant: "public", scopes: [], iss: "https://issuer.test", sub: "nameless" },
  stranger: { principalId: STRANGER, tenant: "public", scopes: [], iss: "https://issuer.test", sub: "stranger" },
};

function endpoint(overrides: Partial<McpEndpointDeps> = {}) {
  const meetings = setupPasses();
  const deps: McpEndpointDeps = {
    verify: async (token) => principals[token] ?? null,
    resourceMetadataUrl: METADATA_URL,
    service: meetings.service,
    passes: meetings.passes,
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
  test("offers exactly the meeting and booking-pass tools, each described for a model to pick correctly", async () => {
    const client = await connect(endpoint().deps, "anna");
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "approve_meeting_request",
      "book_with_pass",
      "create_booking_pass",
      "decline_meeting_request",
      "find_meeting_times",
      "find_times_with_pass",
      "hold_with_pass",
      "list_booking_passes",
      "list_meeting_requests",
      "list_my_calendars",
      "my_meeting_requests",
      "release_with_pass",
      "request_meeting",
      "revoke_booking_pass",
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
    // The old fields stay (the tool is live); the grouped key marks what the requester wrote.
    expect(inbox.body.requests).toEqual([
      expect.objectContaining({ requested_by: annaContact, note: "Coffee?", written_by_requester: { name: "Anna Example", note: "Coffee?" } }),
    ]);

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

describe("booking directly with a pass through MCP", () => {
  const at = (minutes: number) => new Date(T + minutes * 60_000).toISOString();

  /** The owner mints a pass on cal1 for [T, T + 4h) through the tool, as their agent would. */
  async function mintThroughMcp(owner: Awaited<ReturnType<typeof connect>>) {
    const made = await call(owner, "create_booking_pass", { calendar_id: "cal1", from: at(0), to: at(240), label: "for Anna's agent" });
    expect(made.isError).toBe(false);
    return { token: String(made.body.pass), passId: String(made.body.pass_id), body: made.body };
  }

  test("the owner mints a pass, the guest's agent finds, holds and books with it, and the pass is spent", async () => {
    const { deps, meetings } = endpoint();
    const owner = await connect(deps, "owner");
    const anna = await connect(deps, "anna");
    const { token, body } = await mintThroughMcp(owner);
    expect(token.startsWith("dtp_")).toBe(true);
    expect(body).toMatchObject({ status: "active", uses: 1, lengths_minutes: [30], label: "for Anna's agent" });
    expect(String(body.expires)).toContain("(Europe/Berlin)");

    const later: unknown[] = [];
    const found = await call(anna, "find_times_with_pass", { pass: token });
    later.push(found.body);
    expect(found.body).toMatchObject({ calendar: "Simon's week", bookings_left: 1, free: [{ start: at(0), end: at(240) }] });
    expect(JSON.stringify(found.body)).not.toContain("for Anna's agent"); // the owner's label is the owner's

    const held = await call(anna, "hold_with_pass", { pass: token, start: at(60) });
    later.push(held.body);
    expect(held.body).toMatchObject({ booked: false, start: at(60), end: at(90) });

    const booked = await call(anna, "book_with_pass", { pass: token, hold_id: held.body.hold_id, note: "Intro" });
    later.push(booked.body);
    expect(booked.body).toMatchObject({ booked: true, booked_by: "Anna Example", bookings_left: 0 });
    expect(meetings.state.bookings).toEqual([{ id: "booking1", label: "Anna Example" }]);

    const listed = await call(owner, "list_booking_passes", {});
    later.push(listed.body);
    expect(listed.body.passes).toEqual([
      expect.objectContaining({
        status: "spent",
        bookings_left: 0,
        claimed_by: "Anna Example",
        bookings: [expect.objectContaining({ written_by_booker: { name: "Anna Example", note: "Intro" } })],
      }),
    ]);
    expect(JSON.stringify(listed.body)).not.toContain('"booked_by"'); // only the grouped, marked shape

    const again = await call(anna, "find_times_with_pass", { pass: token });
    later.push(again.body);
    expect(again).toEqual({ isError: true, body: { error: "REFUSED", message: PASS_NOT_VALID } });
    expect(JSON.stringify(later)).not.toContain(token.slice(4)); // shown once, at creation, never again
  });

  test("a signed-in stranger without the pass can do nothing to the owner's calendar", async () => {
    const { deps, meetings } = endpoint();
    const owner = await connect(deps, "owner");
    const anna = await connect(deps, "anna");
    const stranger = await connect(deps, "stranger");
    const { token, passId } = await mintThroughMcp(owner);
    const annaHold = await call(anna, "hold_with_pass", { pass: token, start: at(0) });
    const holdId = String(annaHold.body.hold_id);

    // Owner tools: nothing on a calendar that is not theirs, and someone else's pass id opens nothing.
    expect((await call(stranger, "create_booking_pass", { calendar_id: "cal1", from: at(0), to: at(60) })).isError).toBe(true);
    expect((await call(stranger, "list_booking_passes", { calendar_id: "cal1" })).isError).toBe(true);
    expect((await call(stranger, "list_booking_passes", {})).body).toEqual({ passes: [] });
    expect((await call(stranger, "revoke_booking_pass", { pass_id: passId })).isError).toBe(true);

    // Guest tools: every guess, including the pass id and a well-formed pass, gets the one answer. So
    // does the real pass itself: Anna's hold claimed it, so it is hers alone now.
    const guesses = [`dtp_${Buffer.alloc(32, 1).toString("base64url")}`, passId, "", `${token.slice(0, -1)}A`, token];
    for (const pass of guesses) {
      for (const [name, args] of [
        ["find_times_with_pass", { pass }],
        ["hold_with_pass", { pass, start: at(120) }],
        ["book_with_pass", { pass, hold_id: holdId, name: "Eve" }],
        ["release_with_pass", { pass, hold_id: holdId }],
      ] as const) {
        const result = await call(stranger, name, args);
        expect(result).toEqual({ isError: true, body: { error: "REFUSED", message: PASS_NOT_VALID } });
      }
    }

    expect(meetings.state.bookings).toEqual([]);
    expect(meetings.state.released).toEqual([]);
    expect(meetings.state.placed.map((p) => p.id)).toEqual([holdId]);
    const listed = await call(owner, "list_booking_passes", { calendar_id: "cal1" });
    expect(listed.body.passes).toEqual([expect.objectContaining({ pass_id: passId, status: "active", bookings_left: 1, claimed_by: "Anna Example" })]);

    // Revoked, it can book nothing more, and says the one booking it allowed went unused.
    const revoked = await call(owner, "revoke_booking_pass", { pass_id: passId });
    expect(revoked.body).toMatchObject({ status: "revoked", bookings_left: 0, bookings_unused: 1 });
  });

  test("an owner finds their calendar ids with list_my_calendars; another account sees none of them", async () => {
    const { deps } = endpoint();
    const owner = await connect(deps, "owner");
    const stranger = await connect(deps, "stranger");
    expect((await call(owner, "list_my_calendars", {})).body).toEqual({
      calendars: [{ calendar_id: "cal1", name: "Simon's week", timezone: "Europe/Berlin", slot_minutes: 30, takes_meeting_requests: true }],
    });
    expect((await call(stranger, "list_my_calendars", {})).body).toEqual({ calendars: [] });
  });
});
