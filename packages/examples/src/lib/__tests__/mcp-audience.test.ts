import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { mcpAudience, mcpVerifier, type AuthConfig } from "../auth-config";

// /mcp accepted any token the issuer signed, whoever it was minted for. Binding it to an audience is
// right, but nobody can see what audience live MCP tokens carry, and guessing would lock every MCP
// client out on deploy. So the audience is enforced once AUTH_MCP_AUDIENCE is set, and until then the
// audience of each verified token is logged (that string, nothing else) so it can be read and set.

const ISSUER = "https://idp.example";

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

const token = (aud: string | null, opts: { iss?: string; email?: string } = {}) => {
  const jwt = new SignJWT(opts.email ? { email: opts.email } : {})
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(opts.iss ?? ISSUER)
    .setSubject("user_secret_sub")
    .setIssuedAt()
    .setExpirationTime("5m");
  return (aud === null ? jwt : jwt.setAudience(aud)).sign(keys.privateKey);
};

const saved = process.env.AUTH_MCP_AUDIENCE;
afterEach(() => {
  if (saved === undefined) delete process.env.AUTH_MCP_AUDIENCE;
  else process.env.AUTH_MCP_AUDIENCE = saved;
});

describe("AUTH_MCP_AUDIENCE, normalised at the edge", () => {
  test("unset or blank is unset", () => {
    delete process.env.AUTH_MCP_AUDIENCE;
    expect(mcpAudience()).toBeUndefined();
    process.env.AUTH_MCP_AUDIENCE = "   ";
    expect(mcpAudience()).toBeUndefined();
  });

  test("a set value is trimmed", () => {
    process.env.AUTH_MCP_AUDIENCE = " https://delt.at/mcp ";
    expect(mcpAudience()).toBe("https://delt.at/mcp");
  });
});

describe("set: the audience is enforced", () => {
  test("a token for the MCP resource is accepted; any other audience, or none, is refused", async () => {
    const logged: string[] = [];
    const verify = mcpVerifier(config, "https://delt.at/mcp", { links: new Map(), log: (line) => logged.push(line) });
    expect((await verify(await token("https://delt.at/mcp")))?.principalId).toBe(`${ISSUER}#user_secret_sub`);
    expect(await verify(await token("client_site"))).toBeNull();
    expect(await verify(await token(null))).toBeNull();
    expect(logged).toEqual([]);
  });
});

describe("unset: accepted as before, and the audience is logged once per value", () => {
  test("verified tokens pass and each distinct audience is logged once, as the bare string", async () => {
    const logged: string[] = [];
    const verify = mcpVerifier(config, undefined, { links: new Map(), log: (line) => logged.push(line) });
    for (const aud of ["client_mcp", "client_mcp", "client_other", null] as const) {
      expect((await verify(await token(aud, { email: "anna@example.com" })))?.principalId).toBe(`${ISSUER}#user_secret_sub`);
    }
    expect(logged).toEqual(['[mcp] token audience seen: "client_mcp"', '[mcp] token audience seen: "client_other"']);
  });

  test("nothing but the audience is ever logged: not the token, the subject, or any other claim", async () => {
    const logged: string[] = [];
    const verify = mcpVerifier(config, undefined, { links: new Map(), log: (line) => logged.push(line) });
    const t = await token("client_mcp", { email: "anna@example.com" });
    await verify(t);
    const all = logged.join("\n");
    expect(all).not.toContain(t);
    expect(all).not.toContain("user_secret_sub");
    expect(all).not.toContain("anna@example.com");
    expect(all).not.toContain(ISSUER);
  });

  test("a token that does not verify is refused and logs nothing, so strangers cannot write to the log", async () => {
    const logged: string[] = [];
    const verify = mcpVerifier(config, undefined, { links: new Map(), log: (line) => logged.push(line) });
    expect(await verify(await token("attacker_chosen", { iss: "https://elsewhere.example" }))).toBeNull();
    expect(logged).toEqual([]);
  });
});
