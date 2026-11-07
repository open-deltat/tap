import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { CONTACT_COOKIE, readSignInContact } from "@open-deltat/examples/lib/auth-session";
import { fetchVerifiedContact } from "@open-deltat/examples/lib/userinfo";

// Live on delt.at, a signed-in visitor's booking form came up with name and email empty. The form was
// prefilled from userinfo, called with the SITE's session token. That token comes from WorkOS's User
// Management API, a different issuer from the AuthKit OAuth server whose userinfo endpoint is
// configured (auth-config.ts explains the two issuers); userinfo answers only for AuthKit's own tokens
// (it does for the MCP's, which is why meeting requests made through MCP show the name), so the site
// got nothing and userinfo.ts returned null without a word. The name and email are already in the
// sign-in grant, so the callback now keeps them for the session.
//
// Production's shape, modelled: the staging AuthKit issuer, the User Management token endpoint, and
// only the variables the compose file passes.

const AUTHKIT = "https://classic-heron-32-staging.authkit.app";
const UM_TOKEN = "https://api.workos.com/user_management/authenticate";
const PUBLIC = "https://delt.at";
const ENV = {
  AUTH_ISSUER: AUTHKIT,
  AUTH_CLIENT_ID: "client_prod_shape",
  AUTH_TOKEN_URL: UM_TOKEN,
  AUTH_AUTHORIZE_URL: "https://api.workos.com/user_management/authorize",
  AUTH_PROVIDER_PARAM: "authkit",
  PUBLIC_BASE_URL: PUBLIC,
} as const;
const saved = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]]));
const realFetch = globalThis.fetch;

beforeAll(() => {
  Object.assign(process.env, ENV);
});
afterEach(() => {
  globalThis.fetch = realFetch;
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/** A User Management access token: its subject is all the cookie binding reads. */
const umAccessToken = (sub: string) => {
  const part = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part({ iss: "https://api.workos.com/user_management/client_prod_shape", sub, exp: 9_999_999_999 })}.sig`;
};

/** WorkOS's User Management authenticate reply: no id_token, the person in `user`. */
const umGrant = {
  access_token: umAccessToken("user_simon"),
  refresh_token: "rt_1",
  user: { id: "user_simon", email: "simon@example.com", email_verified: true, first_name: "Simon", last_name: "Orzel" },
};

test("the site's own session token gets no userinfo answer, which is why the form was empty", async () => {
  // AuthKit's userinfo answers only for tokens its OAuth server issued.
  const authkitUserinfo: typeof fetch = async (_input, init) => {
    const auth = new Headers(init?.headers).get("authorization") ?? "";
    return auth.includes(umGrant.access_token) ? new Response("unauthorized", { status: 401 }) : Response.json({});
  };
  const contact = await fetchVerifiedContact(umGrant.access_token, { userinfoUrl: `${AUTHKIT}/oauth2/userinfo`, expectedSub: "user_simon", fetchImpl: authkitUserinfo });
  expect(contact).toBeNull();
});

test("signing in keeps the grant's name and email for the session, in an httpOnly cookie, never in the URL", async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) =>
    String(input) === UM_TOKEN ? Response.json(umGrant) : new Response("not found", { status: 404 })) as typeof fetch;
  const { GET } = await import("../../callback/route");
  const req = new NextRequest(`${PUBLIC}/callback?code=c1&state=s1`, { headers: { cookie: "dt_pkce=s1.verifier.%2Fb%2Fcal1%3Fday%3D2026-11-09" } });
  const res = await GET(req);

  const location = res.headers.get("location") ?? "";
  expect(location).not.toContain("simon");
  const cookie = res.cookies.get(CONTACT_COOKIE);
  expect(cookie?.httpOnly).toBe(true);
  expect(readSignInContact(cookie?.value, "user_simon")).toEqual({ name: "Simon Orzel", email: "simon@example.com" });
});

test("the kept contact is only ever read for the session it was kept for", () => {
  const value = JSON.stringify({ sub: "user_simon", name: "Simon Orzel", email: "simon@example.com" });
  expect(readSignInContact(value, "user_simon")).toEqual({ name: "Simon Orzel", email: "simon@example.com" });
  expect(readSignInContact(value, "user_someone_else")).toBeNull();
  expect(readSignInContact("{not json", "user_simon")).toBeNull();
  expect(readSignInContact(undefined, "user_simon")).toBeNull();
});
