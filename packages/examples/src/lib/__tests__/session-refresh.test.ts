import { beforeEach, describe, expect, test } from "bun:test";
import {
  SESSION_LIFETIME_MS,
  forgetRefreshes,
  importSessionKey,
  refreshSession,
  sealRefresh,
  unsealRefresh,
  type RefreshDeps,
} from "../session-refresh";

// The site session is the identity provider's access token, which lives about five minutes, and the
// refresh token was thrown away, so a signed-in person was signed out mid-booking. The refresh token
// is now kept in an encrypted cookie and traded for a fresh access token before the old one runs out.

const MIN = 60_000;
const NOW = Date.UTC(2036, 0, 5, 8);
const KEY_B64 = Buffer.alloc(32, 7).toString("base64");
const TOKEN_URL = "https://idp.example/user_management/authenticate";

/** An access token as far as expiry goes: only `exp` is read before refreshing, never trusted. */
const accessToken = (expMs: number, tag = "a") => {
  const part = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part({ exp: Math.floor(expMs / 1000), tag })}.sig`;
};

type Reply = { status: number; body: string; contentType?: string };
function fakeIdp(reply: Reply | (() => Reply)) {
  const calls: { url: string; body: string; contentType: string | null }[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), body: String(init?.body ?? ""), contentType: new Headers(init?.headers).get("content-type") });
    const r = typeof reply === "function" ? reply() : reply;
    return new Response(r.body, { status: r.status, headers: { "content-type": r.contentType ?? "application/json" } });
  };
  return { calls, fetchFn };
}

const granted = (refreshToken = "rt_2") => ({
  status: 200,
  body: JSON.stringify({ access_token: accessToken(NOW + 5 * MIN, "fresh"), refresh_token: refreshToken, user: { id: "user_1" } }),
});

async function deps(fetchFn: typeof fetch, keyB64: string | null = KEY_B64): Promise<RefreshDeps> {
  return { key: await importSessionKey(keyB64 ?? undefined), tokenUrl: TOKEN_URL, clientId: "client_site", fetch: fetchFn, now: () => NOW };
}

beforeEach(() => forgetRefreshes());

describe("refreshing the session", () => {
  test("an expired access token with a valid refresh cookie comes back fresh, and the refresh token rotates", async () => {
    const idp = fakeIdp(granted("rt_2"));
    const d = await deps(idp.fetchFn);
    const cookie = await sealRefresh(d.key, { refreshToken: "rt_1", startedAt: NOW - 60 * MIN });
    const decision = await refreshSession(d, { session: accessToken(NOW - MIN), refresh: cookie });

    expect(decision.kind).toBe("refreshed");
    if (decision.kind !== "refreshed") return;
    expect(decision.session).toContain(".");
    expect(decision.session).not.toBe(accessToken(NOW - MIN));
    expect(await unsealRefresh(d.key, decision.refresh)).toEqual({ refreshToken: "rt_2", startedAt: NOW - 60 * MIN });
    expect(decision.refreshMaxAgeSeconds).toBe(Math.floor((SESSION_LIFETIME_MS - 60 * MIN) / 1000));
    // The refresh grant exactly as the WorkOS SDK sends it for a public client.
    expect(idp.calls).toHaveLength(1);
    expect(idp.calls[0]?.url).toBe(TOKEN_URL);
    expect(Object.fromEntries(new URLSearchParams(idp.calls[0]?.body))).toEqual({
      grant_type: "refresh_token",
      client_id: "client_site",
      refresh_token: "rt_1",
    });
  });

  test("a token within 60 seconds of expiry is refreshed; one with longer left, or none to refresh, is left alone", async () => {
    const idp = fakeIdp(granted());
    const d = await deps(idp.fetchFn);
    const cookie = await sealRefresh(d.key, { refreshToken: "rt_1", startedAt: NOW });
    expect((await refreshSession(d, { session: accessToken(NOW + 30_000), refresh: cookie })).kind).toBe("refreshed");
    forgetRefreshes();
    expect(await refreshSession(d, { session: accessToken(NOW + 4 * MIN), refresh: cookie })).toEqual({ kind: "keep" });
    expect(await refreshSession(d, { session: accessToken(NOW - MIN), refresh: undefined })).toEqual({ kind: "keep" });
    expect(idp.calls).toHaveLength(1);
  });

  test("a refused refresh signs out once, and the next request does not try again", async () => {
    const idp = fakeIdp({ status: 400, body: JSON.stringify({ error: "invalid_grant" }) });
    const d = await deps(idp.fetchFn);
    const cookie = await sealRefresh(d.key, { refreshToken: "rt_1", startedAt: NOW });
    expect(await refreshSession(d, { session: accessToken(NOW - MIN), refresh: cookie })).toEqual({ kind: "signed-out" });
    // Signed out means both cookies are cleared, so the next request carries no refresh cookie.
    expect(await refreshSession(d, { session: undefined, refresh: undefined })).toEqual({ kind: "keep" });
    expect(idp.calls).toHaveLength(1);
  });

  const wrongBodies: [string, Reply][] = [
    ["an HTML page", { status: 200, body: "<html>login</html>", contentType: "text/html" }],
    ["JSON without a refresh token", { status: 200, body: JSON.stringify({ access_token: "x.y.z" }) }],
    ["JSON without an access token", { status: 200, body: JSON.stringify({ refresh_token: "rt_2" }) }],
    ["an empty body", { status: 200, body: "" }],
  ];
  test.each(wrongBodies)("a 200 carrying %s is a failure, not a session", async (_what, reply) => {
    const d = await deps(fakeIdp(reply).fetchFn);
    const cookie = await sealRefresh(d.key, { refreshToken: "rt_1", startedAt: NOW });
    expect(await refreshSession(d, { session: accessToken(NOW - MIN), refresh: cookie })).toEqual({ kind: "signed-out" });
  });

  test("a tampered or foreign refresh cookie signs out without asking the identity provider", async () => {
    const idp = fakeIdp(granted());
    const d = await deps(idp.fetchFn);
    const cookie = await sealRefresh(d.key, { refreshToken: "rt_1", startedAt: NOW });
    const bytes = Buffer.from(cookie, "base64url");
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1;
    const tampered = bytes.toString("base64url");
    expect(await refreshSession(d, { session: accessToken(NOW - MIN), refresh: tampered })).toEqual({ kind: "signed-out" });
    expect(await refreshSession(d, { session: accessToken(NOW - MIN), refresh: "not-a-cookie" })).toEqual({ kind: "signed-out" });
    const otherKey = await importSessionKey(Buffer.alloc(32, 9).toString("base64"));
    const foreign = await sealRefresh(otherKey, { refreshToken: "rt_1", startedAt: NOW });
    expect(await refreshSession(d, { session: accessToken(NOW - MIN), refresh: foreign })).toEqual({ kind: "signed-out" });
    expect(idp.calls).toHaveLength(0);
  });

  test("a session older than the lifetime cap signs out, however good its refresh token", async () => {
    const idp = fakeIdp(granted());
    const d = await deps(idp.fetchFn);
    const cookie = await sealRefresh(d.key, { refreshToken: "rt_1", startedAt: NOW - SESSION_LIFETIME_MS - 1 });
    expect(await refreshSession(d, { session: accessToken(NOW - MIN), refresh: cookie })).toEqual({ kind: "signed-out" });
    expect(idp.calls).toHaveLength(0);
  });

  test("requests racing on one refresh token share one refresh, so rotation cannot sign the loser out", async () => {
    const idp = fakeIdp(granted("rt_2"));
    const d = await deps(idp.fetchFn);
    const cookie = await sealRefresh(d.key, { refreshToken: "rt_1", startedAt: NOW });
    const expired = accessToken(NOW - MIN);
    const [a, b] = await Promise.all([refreshSession(d, { session: expired, refresh: cookie }), refreshSession(d, { session: expired, refresh: cookie })]);
    // One that arrives just after, still carrying the old cookies, gets the same answer.
    const late = await refreshSession(d, { session: expired, refresh: cookie });
    expect(idp.calls).toHaveLength(1);
    expect([a.kind, b.kind, late.kind]).toEqual(["refreshed", "refreshed", "refreshed"]);
  });
});

describe("the SESSION_SECRET key, normalised at the edge", () => {
  test("unset, blank, or not 32 bytes means no key: no refresh, today's behaviour", async () => {
    expect(await importSessionKey(undefined)).toBeNull();
    expect(await importSessionKey("   ")).toBeNull();
    expect(await importSessionKey(Buffer.alloc(16, 1).toString("base64"))).toBeNull();
  });

  test("without a key nothing is refreshed and nothing is asked", async () => {
    const idp = fakeIdp(granted());
    const d = await deps(idp.fetchFn, null);
    expect(await refreshSession(d, { session: accessToken(NOW - MIN), refresh: "anything" })).toEqual({ kind: "keep" });
    expect(idp.calls).toHaveLength(0);
  });
});
