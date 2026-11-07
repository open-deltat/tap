/**
 * One-time, operator-run re-link after an identity provider move (WorkOS staging -> production).
 * Links each new identity to the principal its records are stored under, matched by verified email;
 * refuses anything ambiguous or unverified. Dry run unless --apply. The steps, and why it works this
 * way, are in packages/examples/src/lib/identity-links.ts.
 *
 *   bun run scripts/relink-identities.ts --old-issuer <url> --new-issuer <url> \
 *     --old-users old.json --new-users new.json [--apply]
 *
 * old.json / new.json: JSON arrays of { "sub": "...", "email": "...", "emailVerified": true }.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { applyRelink, identityLinksPath, loadIdentityLinks, planRelink, type IdpUser } from "@open-deltat/examples/lib/identity-links";
import { openBookableRegistry } from "@open-deltat/examples/lib/public-bookables";
import { openMeetingRequestStore } from "@open-deltat/examples/lib/meeting-requests";

const isUser = (v: unknown): v is IdpUser => {
  if (typeof v !== "object" || v === null) return false;
  const r: Record<string, unknown> = Object.fromEntries(Object.entries(v));
  return typeof r.sub === "string" && r.sub !== "" && typeof r.email === "string" && typeof r.emailVerified === "boolean";
};

function readUsers(path: string): IdpUser[] {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed) || !parsed.every(isUser)) {
    throw new Error(`${path}: expected a JSON array of { sub, email, emailVerified }.`);
  }
  return parsed;
}

// The issuer is compared as a string, so it is normalised the way auth-config.ts normalises AUTH_ISSUER.
const issuer = (raw: string | undefined, flag: string): string => {
  const trimmed = raw?.trim();
  const value = trimmed?.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  if (!value || !URL.canParse(value)) throw new Error(`${flag} must be the issuer URL.`);
  return value;
};

function run(): number {
  const { values } = parseArgs({
    options: {
      "old-issuer": { type: "string" },
      "new-issuer": { type: "string" },
      "old-users": { type: "string" },
      "new-users": { type: "string" },
      apply: { type: "boolean", default: false },
    },
  });
  const oldUsersPath = values["old-users"];
  const newUsersPath = values["new-users"];
  if (!oldUsersPath || !newUsersPath) throw new Error("--old-users and --new-users are required.");

  // Raw stores, no canonicalization: the question is what is stored under an id, exactly.
  const registry = openBookableRegistry(process.env.PUBLIC_BOOKABLES_PATH ?? "./data/public-bookables.json");
  const requests = openMeetingRequestStore(process.env.MEETING_REQUESTS_PATH ?? "./data/meeting-requests.json");
  const linksPath = identityLinksPath();

  const plan = planRelink({
    oldIssuer: issuer(values["old-issuer"], "--old-issuer"),
    newIssuer: issuer(values["new-issuer"], "--new-issuer"),
    oldUsers: readUsers(oldUsersPath),
    newUsers: readUsers(newUsersPath),
    existing: loadIdentityLinks(linksPath),
    ownsAnything: (id) => registry.listOwned(id).length > 0 || requests.listForRequester(id).length > 0,
    now: Date.now(),
  });

  for (const d of plan.decisions) {
    const calendars = registry.listOwned(d.principal).length;
    const line = d.kind === "refused" ? `REFUSED ${d.email}: ${d.reason}` : `${d.kind.toUpperCase()} ${d.email}: ${d.identity} -> ${d.principal}`;
    console.log(`${line} (${calendars} calendars)`);
  }
  const refused = plan.decisions.filter((d) => d.kind === "refused").length;
  console.log(`\n${plan.links.length} to link, ${plan.decisions.length - plan.links.length - refused} already linked, ${refused} refused.`);

  if (!values.apply) {
    console.log("Dry run: nothing written. Add --apply to write the links.");
    return 0;
  }
  applyRelink({ linksPath, logPath: join(dirname(linksPath), "identity-links.log"), plan, at: Date.now() });
  console.log(`Wrote ${linksPath}. Restart the app to load it.`);
  return 0;
}

const code = (() => {
  try {
    return run();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
})();
process.exit(code);
