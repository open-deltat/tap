import { beforeEach, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { withFreshSession } from "../session-proxy";
import { forgetRefreshes, importSessionKey, sealRefresh, type RefreshDeps } from "../session-refresh";

// The refresh has to reach the server action in the same request (a hold is a server action), not
// only the browser's next one. So the proxy writes the fresh token into the request it forwards.

const NOW = Date.UTC(2036, 0, 5, 8);
const jwt = (expMs: number, tag: string) => {
  const part = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part({ exp: Math.floor(expMs / 1000), tag })}.sig`;
};
const FRESH = jwt(NOW + 300_000, "fresh");

async function deps(status = 200): Promise<RefreshDeps> {
  const body = status === 200 ? JSON.stringify({ access_token: FRESH, refresh_token: "rt_2" }) : "{}";
  return {
    key: await importSessionKey(Buffer.alloc(32, 7).toString("base64")),
    tokenUrl: "https://idp.example/token",
    clientId: "client_site",
    fetch: async () => new Response(body, { status, headers: { "content-type": "application/json" } }),
    now: () => NOW,
  };
}

async function request(d: RefreshDeps) {
  const refresh = await sealRefresh(d.key, { refreshToken: "rt_1", startedAt: NOW });
  return new NextRequest("https://delt.at/b/cal", { headers: { cookie: `dt_session=${jwt(NOW - 60_000, "old")}; dt_refresh=${refresh}` } });
}

beforeEach(() => forgetRefreshes());

test("the forwarded request carries the fresh token, and the browser gets both new cookies", async () => {
  const d = await deps();
  const res = await withFreshSession(await request(d), d);
  expect(res.headers.get("x-middleware-request-cookie")).toContain(`dt_session=${FRESH}`);
  expect(res.cookies.get("dt_session")?.value).toBe(FRESH);
  const refresh = res.cookies.get("dt_refresh");
  expect(refresh?.httpOnly).toBe(true);
  expect(refresh?.sameSite).toBe("lax");
});

test("a failed refresh forwards the request signed out and tells the browser to forget both cookies", async () => {
  const d = await deps(400);
  const res = await withFreshSession(await request(d), d);
  expect(res.headers.get("x-middleware-request-cookie") ?? "").not.toContain("dt_session=");
  expect(res.cookies.get("dt_session")?.value).toBe("");
  expect(res.cookies.get("dt_refresh")?.value).toBe("");
});

test("without refresh deps the request passes untouched", async () => {
  const d = await deps();
  const res = await withFreshSession(await request(d), null);
  expect(res.cookies.get("dt_session")).toBeUndefined();
});
