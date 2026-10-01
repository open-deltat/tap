import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { canonicalPrincipalId, type AuthConfig } from "../auth-config";
import { openBookableRegistry } from "../public-bookables";
import { openMeetingRequestStore } from "../meeting-requests";
import { annaContact, tmpPath } from "./meeting-fixtures";

// One person, one id. WorkOS signs the site's sessions as its User Management API and an MCP client's
// tokens as its AuthKit OAuth server: two `iss` values, one user. Keyed by the raw `iss#sub`, the
// owner of a calendar was a stranger to it through MCP.

const AUTHKIT = "https://example.authkit.app";
const USER_MANAGEMENT = "https://api.workos.com/user_management/client_test";
const config: AuthConfig = {
  issuer: AUTHKIT,
  clientId: "client_test",
  authorizeUrl: `${AUTHKIT}/oauth2/authorize`,
  tokenUrl: `${AUTHKIT}/oauth2/token`,
  jwksUri: `${AUTHKIT}/oauth2/jwks`,
  userinfoUrl: `${AUTHKIT}/oauth2/userinfo`,
  trustedIssuers: [AUTHKIT, USER_MANAGEMENT],
  extraAuthorizeParams: {},
};

describe("the one id a person has", () => {
  test("is the same whichever of the provider's issuers signed the token", () => {
    expect(canonicalPrincipalId(`${USER_MANAGEMENT}#user_1`, config)).toBe(`${AUTHKIT}#user_1`);
    expect(canonicalPrincipalId(`${AUTHKIT}#user_1`, config)).toBe(`${AUTHKIT}#user_1`);
  });

  test("leaves an id from an issuer outside the trusted set alone, so no stranger can merge into a user", () => {
    expect(canonicalPrincipalId("https://evil.example#user_1", config)).toBe("https://evil.example#user_1");
  });

  test("leaves ids alone when sign-in is off or the id has no issuer part", () => {
    expect(canonicalPrincipalId(`${USER_MANAGEMENT}#user_1`, null)).toBe(`${USER_MANAGEMENT}#user_1`);
    expect(canonicalPrincipalId("no-issuer", config)).toBe("no-issuer");
  });
});

describe("records written under another issuer", () => {
  const canonical = (id: string) => canonicalPrincipalId(id, config);

  test("a calendar created through the site stays its owner's when the owner arrives through MCP", () => {
    const path = tmpPath("identity-registry");
    writeFileSync(
      path,
      JSON.stringify({
        version: 1,
        records: [{ id: "cal", name: "Simon", slotMinutes: 30, timezone: "UTC", createdAt: 1, keyHash: "h", owner: `${USER_MANAGEMENT}#user_1` }],
      })
    );
    const registry = openBookableRegistry(path, { canonicalOwner: canonical });
    expect(registry.authorizeOwner("cal", `${AUTHKIT}#user_1`)?.id).toBe("cal");
    expect(registry.listOwned(`${AUTHKIT}#user_1`).map((r) => r.id)).toEqual(["cal"]);
    expect(registry.authorizeOwner("cal", `${AUTHKIT}#user_2`)).toBeUndefined();
  });

  test("a request made through the site is still its requester's through MCP", () => {
    const path = tmpPath("identity-requests");
    const store = openMeetingRequestStore(path);
    store.create({ calendarId: "cal", requester: `${USER_MANAGEMENT}#user_1`, contact: annaContact, start: 10, end: 20, note: null });
    const reopened = openMeetingRequestStore(path, { canonicalRequester: canonical });
    expect(reopened.listForRequester(`${AUTHKIT}#user_1`)).toHaveLength(1);
  });
});
