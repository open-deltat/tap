import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { OidcAdapter } from "@open-deltat/mcp";
import { canonicalVerifier, type AuthConfig } from "../auth-config";
import { handleMcpRequest } from "../mcp-endpoint";
import { createRateLimiter } from "../rate-limit";
import { T, annaContact, setupMeetings } from "./meeting-fixtures";

// Production's shape, not a stand-in for it: real RS256 tokens, a real JWKS served over HTTP, the real
// OidcAdapter, and the verifier the site's session and /mcp both use. The earlier endpoint tests
// faked verification with one invented issuer, which is the very assumption that failed in
// production: WorkOS signs the site's sessions as its User Management API and an MCP client's tokens
// as its AuthKit OAuth server, two issuers for one user, and the owner of a calendar was refused its
// own inbox through MCP.

const AUTHKIT = "https://example-idp.authkit.app";
const USER_MANAGEMENT = "https://api.workos.test/user_management/client_test";

const keys = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(keys.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
const jwks = Bun.serve({ port: 0, fetch: () => Response.json({ keys: [jwk] }) });
const servers: { stop: (force?: boolean) => void }[] = [jwks];
afterAll(() => {
  for (const s of servers) s.stop(true);
});

const config: AuthConfig = {
  issuer: AUTHKIT,
  clientId: "client_test",
  authorizeUrl: `${AUTHKIT}/oauth2/authorize`,
  tokenUrl: `${AUTHKIT}/oauth2/token`,
  jwksUri: `http://localhost:${jwks.port}/jwks`,
  userinfoUrl: `${AUTHKIT}/oauth2/userinfo`,
  trustedIssuers: [AUTHKIT, USER_MANAGEMENT],
  extraAuthorizeParams: {},
};
const adapter = new OidcAdapter({ jwksUri: config.jwksUri, trustedIssuers: config.trustedIssuers, tenant: "public" });
const verify = canonicalVerifier((token) => adapter.verify(token), config);

const token = (iss: string, sub: string) =>
  new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(iss)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(keys.privateKey);

const tokens: Record<string, string> = {};
beforeAll(async () => {
  tokens.simonSite = await token(USER_MANAGEMENT, "user_simon"); // the site's session cookie
  tokens.simonMcp = await token(AUTHKIT, "user_simon"); // Claude's MCP sign-in
  tokens.annaMcp = await token(AUTHKIT, "user_anna");
  tokens.stranger = await token("https://elsewhere.example", "user_simon");
});

describe("one person, two issuers", () => {
  test("the site's token and an MCP client's token for one user verify to one id", async () => {
    const site = await verify(tokens.simonSite ?? "");
    const mcp = await verify(tokens.simonMcp ?? "");
    expect(site?.principalId).toBe(`${AUTHKIT}#user_simon`);
    expect(mcp?.principalId).toBe(site?.principalId);
  });

  test("another user stays another person, and an untrusted issuer gets no identity at all", async () => {
    expect((await verify(tokens.annaMcp ?? ""))?.principalId).toBe(`${AUTHKIT}#user_anna`);
    expect(await verify(tokens.stranger ?? "")).toBeNull();
  });

  test("a calendar made through the site is answered by its owner through MCP", async () => {
    const meetings = setupMeetings();
    const site = await verify(tokens.simonSite ?? "");
    if (!site) throw new Error("the site token did not verify");
    // Created through the site: the owner is whatever the site's session verified to.
    meetings.registry.register({ id: "simon", name: "Simon", slotMinutes: 30, timezone: "Europe/Berlin", owner: site.principalId });
    meetings.registry.updateOwned("simon", site.principalId, { bookingMode: "request" });

    const server = Bun.serve({
      port: 0,
      fetch: (req) =>
        handleMcpRequest(req, {
          verify,
          resourceMetadataUrl: "https://delt.at/.well-known/oauth-protected-resource/mcp",
          service: meetings.service,
          calendarOf: (id) => meetings.registry.get(id),
          contactFor: async () => annaContact,
          limiter: createRateLimiter({ limit: 1_000, windowMs: 60_000 }),
        }),
    });
    servers.push(server);
    const connect = async (bearer: string) => {
      const client = new Client({ name: "test", version: "0" });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`http://localhost:${server.port}/mcp`), {
          requestInit: { headers: { authorization: `Bearer ${bearer}` } },
        })
      );
      return client;
    };
    const call = async (client: Client, name: string, args: Record<string, unknown>) => {
      const result = await client.callTool({ name, arguments: args });
      const [content] = result.content as { text: string }[];
      return { isError: result.isError === true, body: JSON.parse(content?.text ?? "null") as Record<string, unknown> };
    };

    const anna = await connect(tokens.annaMcp ?? "");
    const asked = await call(anna, "request_meeting", { calendar_id: "simon", start: new Date(T).toISOString() });
    expect(asked.isError).toBe(false);

    const simon = await connect(tokens.simonMcp ?? "");
    const inbox = await call(simon, "list_meeting_requests", { calendar_id: "simon" });
    expect(inbox.isError).toBe(false); // was "You do not own this calendar."
    const approved = await call(simon, "approve_meeting_request", { request_id: asked.body.request_id });
    expect(approved.body).toMatchObject({ status: "approved", booked: true });
  });
});
