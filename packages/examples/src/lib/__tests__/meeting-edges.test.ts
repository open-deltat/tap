import { describe, expect, test } from "bun:test";
import { fetchVerifiedContact } from "../userinfo";
import { webhookNotifier, webhookUrlFrom } from "../notify";
import { publicBaseUrlFrom, siteOrigin } from "../public-base-url";

const USERINFO = "https://issuer.test/oauth2/userinfo";

/** A fetch that answers once with `body` and records what it was asked. */
function answering(body: unknown, init: { status?: number; raw?: string } = {}) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl = (async (url: string | URL | Request, reqInit?: RequestInit) => {
    calls.push({ url: String(url), init: reqInit });
    return new Response(init.raw ?? JSON.stringify(body), { status: init.status ?? 200 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe("the requester's contact from userinfo", () => {
  test("asks with the caller's own token and takes the provider's word on the email", async () => {
    const { fetchImpl, calls } = answering({ sub: "u1", name: "Anna Example", email: "anna@example.com", email_verified: true });
    const contact = await fetchVerifiedContact("tok", { userinfoUrl: USERINFO, expectedSub: "u1", fetchImpl });
    expect(contact).toEqual({ name: "Anna Example", email: "anna@example.com", emailVerified: true });
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe("Bearer tok");
  });

  test("a userinfo naming another subject is not this caller's contact", async () => {
    const { fetchImpl } = answering({ sub: "someone-else", name: "Mallory", email: "m@example.com", email_verified: true });
    expect(await fetchVerifiedContact("tok", { userinfoUrl: USERINFO, expectedSub: "u1", fetchImpl })).toBeNull();
  });

  test("builds a name from given and family names, or the email, and marks an unverified email", async () => {
    const both = answering({ sub: "u1", given_name: "Anna", family_name: "Example", email: "anna@example.com" });
    expect(await fetchVerifiedContact("t", { userinfoUrl: USERINFO, expectedSub: "u1", fetchImpl: both.fetchImpl })).toEqual({
      name: "Anna Example",
      email: "anna@example.com",
      emailVerified: false,
    });
    const emailOnly = answering({ sub: "u1", email: "anna@example.com", email_verified: true });
    expect((await fetchVerifiedContact("t", { userinfoUrl: USERINFO, expectedSub: "u1", fetchImpl: emailOnly.fetchImpl }))?.name).toBe("anna");
  });

  test("an error status, a body that is not JSON, or no usable name gives null instead of throwing", async () => {
    for (const reply of [
      answering({}, { status: 401 }),
      answering(null, { raw: "<html>login</html>" }),
      answering({ sub: "u1" }),
      answering(["sub", "u1"]),
    ]) {
      expect(await fetchVerifiedContact("t", { userinfoUrl: USERINFO, expectedSub: "u1", fetchImpl: reply.fetchImpl })).toBeNull();
    }
    const down = (async () => {
      throw new Error("connect ECONNREFUSED");
    }) as unknown as typeof fetch;
    expect(await fetchVerifiedContact("t", { userinfoUrl: USERINFO, expectedSub: "u1", fetchImpl: down })).toBeNull();
  });
});

describe("the owner's webhook", () => {
  test("only an https URL is used; blank or anything else leaves notifications off", () => {
    expect(webhookUrlFrom(undefined)).toBeNull();
    expect(webhookUrlFrom("   ")).toBeNull();
    expect(webhookUrlFrom("http://hooks.example.com/x")).toBeNull();
    expect(webhookUrlFrom("not a url")).toBeNull();
    expect(webhookUrlFrom(" https://hooks.example.com/x ")?.href).toBe("https://hooks.example.com/x");
  });

  test("posts the line as both text and content, for Slack and Discord alike", async () => {
    const { fetchImpl, calls } = answering({});
    await webhookNotifier(new URL("https://hooks.example.com/x"), fetchImpl)({ text: "Anna asks for Sunday", calendarId: "c", requestId: "r" });
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ text: "Anna asks for Sunday", content: "Anna asks for Sunday", calendar_id: "c", request_id: "r" });
  });

  test("a webhook that refuses or is unreachable never fails the request", async () => {
    const refused = answering({}, { status: 500 });
    const down = (async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    }) as unknown as typeof fetch;
    const notice = { text: "x", calendarId: "c", requestId: "r" };
    await webhookNotifier(new URL("https://hooks.example.com/x"), refused.fetchImpl)(notice);
    await webhookNotifier(new URL("https://hooks.example.com/x"), down)(notice);
  });
});

describe("the site's public origin", () => {
  test("is reduced to an origin, and only http(s) counts", () => {
    expect(publicBaseUrlFrom("https://delt.at/")).toBe("https://delt.at");
    expect(publicBaseUrlFrom(" https://delt.at/some/path ")).toBe("https://delt.at");
    expect(publicBaseUrlFrom("javascript:alert(1)")).toBeNull();
    expect(publicBaseUrlFrom("")).toBeNull();
    expect(publicBaseUrlFrom(undefined)).toBeNull();
  });

  test("sign-in sends people to the public origin, not the address the app sees behind the proxy", () => {
    expect(siteOrigin("https://localhost:3000", "https://delt.at")).toBe("https://delt.at");
    // Reached directly (local development), the request's own origin is the right one.
    expect(siteOrigin("http://localhost:3000", null)).toBe("http://localhost:3000");
  });
});
