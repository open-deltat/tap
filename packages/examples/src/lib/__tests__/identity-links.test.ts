import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { canonicalPrincipalId, type AuthConfig } from "../auth-config";
import { loadIdentityLinks, planRelink, applyRelink, type IdpUser } from "../identity-links";
import { openBookableRegistry } from "../public-bookables";
import { tmpPath } from "./meeting-fixtures";

// Owner ids are AUTH_ISSUER#sub, stored in every record. Moving WorkOS from staging to production
// changes both the issuer and every sub, so every calendar would belong to nobody. The fix keeps the
// stored ids as they are (they become the stable principal) and links each new identity to its old
// principal at the edge, matched by verified email, with ambiguous or unverified matches refused.

const STAGING = "https://api.workos.com/user_management/client_staging";
const PROD = "https://auth.delt.at";

const prodConfig: AuthConfig = {
  issuer: PROD,
  clientId: "client_prod",
  authorizeUrl: `${PROD}/oauth2/authorize`,
  tokenUrl: `${PROD}/oauth2/token`,
  jwksUri: `${PROD}/oauth2/jwks`,
  userinfoUrl: `${PROD}/oauth2/userinfo`,
  trustedIssuers: [PROD],
  extraAuthorizeParams: {},
};

const user = (sub: string, email: string, emailVerified = true): IdpUser => ({ sub, email, emailVerified });
const nobodyOwnsAnything = () => false;

function plan(oldUsers: IdpUser[], newUsers: IdpUser[], opts: { existing?: Map<string, string>; ownsAnything?: (id: string) => boolean } = {}) {
  return planRelink({
    oldIssuer: STAGING,
    newIssuer: PROD,
    oldUsers,
    newUsers,
    existing: opts.existing ?? new Map(),
    ownsAnything: opts.ownsAnything ?? nobodyOwnsAnything,
    now: 1_000,
  });
}

describe("planning the re-link", () => {
  test("one verified email on each side links the new identity to the old principal", () => {
    const { links, decisions } = plan([user("user_old_simon", "Simon@Example.com")], [user("user_new_simon", "simon@example.com")]);
    expect(links).toEqual([
      { identity: `${PROD}#user_new_simon`, principal: `${STAGING}#user_old_simon`, email: "simon@example.com", linkedAt: 1_000 },
    ]);
    expect(decisions).toEqual([{ kind: "linked", email: "simon@example.com", identity: `${PROD}#user_new_simon`, principal: `${STAGING}#user_old_simon` }]);
  });

  const refusals: [string, IdpUser[], IdpUser[], string][] = [
    ["the old email is unverified", [user("o1", "a@example.com", false)], [user("n1", "a@example.com")], "the old account's email is not verified"],
    ["the new email is unverified", [user("o1", "a@example.com")], [user("n1", "a@example.com", false)], "the new account's email is not verified"],
    ["two new accounts share the email", [user("o1", "a@example.com")], [user("n1", "a@example.com"), user("n2", "a@example.com")], "2 new accounts have this email"],
    ["two old accounts share the email", [user("o1", "a@example.com"), user("o2", "a@example.com")], [user("n1", "a@example.com")], "2 old accounts have this email"],
    ["nobody has it in the new environment", [user("o1", "a@example.com")], [user("n1", "b@example.com")], "no account in the new environment has this email"],
  ];
  test.each(refusals)("refused when %s", (_why, oldUsers, newUsers, reason) => {
    const { links, decisions } = plan(oldUsers, newUsers);
    expect(links).toEqual([]);
    expect(decisions.every((d) => d.kind === "refused" && d.reason === reason)).toBe(true);
  });

  test("a new identity that already owns something under its own id is refused, so nothing it made is hidden", () => {
    const { links, decisions } = plan([user("o1", "a@example.com")], [user("n1", "a@example.com")], {
      ownsAnything: (id) => id === `${PROD}#n1`,
    });
    expect(links).toEqual([]);
    expect(decisions).toMatchObject([{ kind: "refused", reason: "the new account already owns calendars or requests under its own id" }]);
  });

  test("running it again keeps what is linked and never moves an identity to a second principal", () => {
    const existing = new Map([[`${PROD}#n1`, `${STAGING}#o1`]]);
    expect(plan([user("o1", "a@example.com")], [user("n1", "a@example.com")], { existing })).toMatchObject({
      links: [],
      decisions: [{ kind: "kept" }],
    });
    expect(plan([user("o2", "a@example.com")], [user("n1", "a@example.com")], { existing })).toMatchObject({
      links: [],
      decisions: [{ kind: "refused", reason: "the new account is already linked to another principal" }],
    });
  });
});

describe("applying it", () => {
  test("links are written atomically beside the old ones and every decision is logged", () => {
    const linksPath = tmpPath("links");
    const logPath = tmpPath("links-log");
    const first = plan([user("o1", "a@example.com")], [user("n1", "a@example.com")]);
    applyRelink({ linksPath, logPath, plan: first, at: 1_000 });
    const second = plan([user("o2", "b@example.com"), user("o3", "c@example.com", false)], [user("n2", "b@example.com"), user("n3", "c@example.com")], {
      existing: loadIdentityLinks(linksPath),
    });
    applyRelink({ linksPath, logPath, plan: second, at: 2_000 });

    expect([...loadIdentityLinks(linksPath)]).toEqual([
      [`${PROD}#n1`, `${STAGING}#o1`],
      [`${PROD}#n2`, `${STAGING}#o2`],
    ]);
    const logged = readFileSync(logPath, "utf8").trim().split("\n").map((line) => JSON.parse(line).kind);
    expect(logged).toEqual(["linked", "linked", "refused"]);
  });

  test("a links file that does not parse stops the load rather than quietly orphaning everyone linked", () => {
    const path = tmpPath("links-bad");
    writeFileSync(path, "{ not json");
    expect(() => loadIdentityLinks(path)).toThrow();
    expect(loadIdentityLinks(tmpPath("links-missing")).size).toBe(0);
  });
});

describe("at the edge, after the switch", () => {
  test("the new production identity is the old principal, so its calendars are still its own", () => {
    const links = new Map([[`${PROD}#user_new_simon`, `${STAGING}#user_old_simon`]]);
    const canonical = (id: string) => canonicalPrincipalId(id, prodConfig, links);
    const path = tmpPath("links-registry");
    writeFileSync(
      path,
      JSON.stringify({
        version: 1,
        records: [{ id: "cal", name: "Simon", slotMinutes: 30, timezone: "UTC", createdAt: 1, keyHash: "h", owner: `${STAGING}#user_old_simon` }],
      })
    );
    const registry = openBookableRegistry(path, { canonicalOwner: canonical });
    const signedIn = canonical(`${PROD}#user_new_simon`);
    expect(registry.authorizeOwner("cal", signedIn)?.id).toBe("cal");
    expect(registry.authorizeOwner("cal", canonical(`${PROD}#user_someone_else`))).toBeUndefined();
    expect(readFileSync(path, "utf8")).toContain(`${STAGING}#user_old_simon`); // no stored record rewritten
  });
});
