import { afterAll, beforeAll, expect, test } from "bun:test";
import { NextRequest } from "next/server";

// Behind Coolify's proxy the app sees every request addressed to its own localhost:3000. Sign-in built
// its return address from that, and WorkOS refused "https://localhost:3000/callback" on delt.at. These
// drive the real route handlers with a request shaped the way production delivers it.

const INTERNAL = "http://localhost:3000";
const PUBLIC = "https://delt.at";
const ENV = {
  AUTH_ISSUER: "https://idp.example",
  AUTH_CLIENT_ID: "client_test",
  PUBLIC_BASE_URL: PUBLIC,
} as const;
const saved = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]]));

beforeAll(() => {
  Object.assign(process.env, ENV);
});
afterAll(() => {
  // Test files share one process; leave the environment as it was found.
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test("sign-in asks the identity provider to return to the public site, not to localhost", async () => {
  const { GET } = await import("../login/route");
  const res = await GET(new NextRequest(`${INTERNAL}/auth/login?returnTo=/dashboard`));
  const authorize = new URL(res.headers.get("location") ?? "");
  expect(authorize.searchParams.get("redirect_uri")).toBe(`${PUBLIC}/callback`);
});

test("a callback sends the person on to the public site, also when the flow fails", async () => {
  const { GET } = await import("../../callback/route");
  const res = await GET(new NextRequest(`${INTERNAL}/callback?code=abc&state=xyz`));
  const next = new URL(res.headers.get("location") ?? "");
  expect(next.origin).toBe(PUBLIC);
});

test("signing out lands on the public site", async () => {
  const { POST } = await import("../logout/route");
  const res = await POST(new NextRequest(`${INTERNAL}/auth/logout`, { method: "POST" }));
  expect(res.headers.get("location")).toBe(`${PUBLIC}/`);
});
