import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { ApiKeyAdapter, mintApiKey } from "../auth.js";
import { OidcAdapter } from "../oidc.js";

const hash = (key: string) => createHash("sha256").update(key, "utf8").digest("hex");

describe("ApiKeyAdapter", () => {
  const key = mintApiKey();
  const adapter = new ApiKeyAdapter([
    { keyHash: hash(key), principalId: "svc-demo", tenant: "demo", scopes: ["hold:write"] },
  ]);

  test("the minted key verifies to its principal and tenant", async () => {
    const principal = await adapter.verify(key);
    expect(principal).not.toBeNull();
    expect(principal?.principalId).toBe("svc-demo");
    expect(principal?.tenant).toBe("demo");
    expect(principal?.scopes).toEqual(["hold:write"]);
  });

  test("a wrong key fails closed", async () => {
    expect(await adapter.verify(mintApiKey())).toBeNull();
  });

  test("an empty credential fails closed", async () => {
    expect(await adapter.verify("")).toBeNull();
  });

  test("a malformed stored hash fails closed instead of throwing", async () => {
    const broken = new ApiKeyAdapter([
      { keyHash: "not-hex!", principalId: "p", tenant: "t", scopes: [] },
    ]);
    expect(await broken.verify("anything")).toBeNull();
  });

  test("minted keys are 24 bytes of base64url and unique", () => {
    const a = mintApiKey();
    const b = mintApiKey();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, "base64url").length).toBe(24);
  });
});

describe("OidcAdapter (offline failure paths; the live path is the browser sign-in flow)", () => {
  const adapter = new OidcAdapter({
    jwksUri: "https://example.invalid/jwks",
    trustedIssuers: ["https://example.invalid"],
    tenant: "demo",
  });

  test("garbage fails closed, no throw and no network dependency on the happy path", async () => {
    expect(await adapter.verify("not-a-jwt")).toBeNull();
  });

  test("a structurally valid but unsigned JWT fails closed", async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const forged = `${b64({ alg: "none" })}.${b64({ iss: "https://example.invalid", sub: "user_1" })}.`;
    expect(await adapter.verify(forged)).toBeNull();
  });

  test("an empty trusted-issuer set is rejected at construction", () => {
    expect(
      () => new OidcAdapter({ jwksUri: "https://x/jwks", trustedIssuers: [], tenant: "t" })
    ).toThrow();
  });
});
