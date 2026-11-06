import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { mcpAudience, mcpVerifier, type AuthConfig } from "../auth-config";

// /mcp accepted any token the issuer signed, whoever it was minted for: the site's own session token,
// or a token another app of the same WorkOS environment obtained. A resource server must only take
// tokens issued for it (MCP authorization spec), so the audience is now always checked.

const ISSUER = "https://idp.example";
const BASE = "https://delt.at";

const keys = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(keys.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
const jwks = Bun.serve({ port: 0, fetch: () => Response.json({ keys: [jwk] }) });
afterAll(() => jwks.stop(true));

const config: AuthConfig = {
  issuer: ISSUER,
  clientId: "client_site",
  authorizeUrl: `${ISSUER}/oauth2/authorize`,
  tokenUrl: `${ISSUER}/oauth2/token`,
  jwksUri: `http://localhost:${jwks.port}/jwks`,
  userinfoUrl: `${ISSUER}/oauth2/userinfo`,
  trustedIssuers: [ISSUER],
  extraAuthorizeParams: {},
};

const token = (aud: string | null) => {
  const jwt = new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(ISSUER).setSubject("user_1").setIssuedAt().setExpirationTime("5m");
  return (aud === null ? jwt : jwt.setAudience(aud)).sign(keys.privateKey);
};

const saved = process.env.AUTH_MCP_AUDIENCE;
afterEach(() => {
  if (saved === undefined) delete process.env.AUTH_MCP_AUDIENCE;
  else process.env.AUTH_MCP_AUDIENCE = saved;
});

describe("the audience /mcp requires", () => {
  test("unset or blank means this server's own MCP resource, never no check", () => {
    delete process.env.AUTH_MCP_AUDIENCE;
    expect(mcpAudience(BASE)).toBe(`${BASE}/mcp`);
    process.env.AUTH_MCP_AUDIENCE = "   ";
    expect(mcpAudience(BASE)).toBe(`${BASE}/mcp`);
  });

  test("a configured value wins, trimmed", () => {
    process.env.AUTH_MCP_AUDIENCE = " https://other.example/mcp ";
    expect(mcpAudience(BASE)).toBe("https://other.example/mcp");
  });
});

describe("tokens at /mcp", () => {
  const verify = mcpVerifier(config, `${BASE}/mcp`, new Map());

  test("one minted for the MCP resource is accepted", async () => {
    expect((await verify(await token(`${BASE}/mcp`)))?.principalId).toBe(`${ISSUER}#user_1`);
  });

  test("the site's session token, and one with no audience, are refused", async () => {
    expect(await verify(await token("client_site"))).toBeNull();
    expect(await verify(await token(null))).toBeNull();
  });
});
