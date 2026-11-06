import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Linked identities: which sign-in identity (`iss#sub`) acts as which stable principal.
 *
 * Every stored record names its owner or requester by a principal id, and until a link exists a
 * principal id is simply the `iss#sub` it was first created under. A link says "this other identity
 * is that same person". It is applied where tokens are verified (auth-config.ts canonicalPrincipalId),
 * so a person keeps everything they own across an identity provider move with no stored record
 * rewritten, and undoing a link is deleting one line.
 *
 * Why it exists: moving WorkOS from staging to production changes the issuer and every sub, so every
 * calendar would belong to nobody. The operator re-link (demo/scripts/relink-identities.ts) writes
 * the links once, matched by verified email, and refuses every match it cannot be sure of.
 *
 * Operator steps for a WorkOS staging -> production switch (the WorkOS side is done in WorkOS):
 *   1. Put every staging user into the production environment (WorkOS user import), so each person
 *      has a production user with the same, verified email. Export both user lists as JSON arrays of
 *      { sub, email, emailVerified } (from GET /user_management/users: sub is the user's id).
 *   2. In the running container (cd /app/demo), dry run and read every refusal:
 *        bun run scripts/relink-identities.ts --old-issuer <staging AUTH_ISSUER> \
 *          --new-issuer <production AUTH_ISSUER> --old-users old.json --new-users new.json
 *   3. Run it again with --apply. It writes data/identity-links.json (atomically, beside any links
 *      already there) and appends every decision to data/identity-links.log. Staging sign-ins are
 *      untouched: only production identities are keys.
 *   4. Switch the AUTH_* settings to production and redeploy; the links load at start-up.
 *   5. Someone refused, or not imported in time, signs in under a new id and sees an empty dashboard;
 *      their old records are intact. Fix the cause and run steps 2 and 3 again, before that identity
 *      creates anything (the tool refuses an identity that already owns something, because linking it
 *      would hide what it made).
 */

export type IdentityLinks = ReadonlyMap<string, string>;

export interface IdentityLink {
  /** The sign-in identity, `AUTH_ISSUER#sub` after issuer canonicalization. */
  readonly identity: string;
  /** The principal it acts as: the id its records are stored under. */
  readonly principal: string;
  /** The verified email both accounts shared, kept for the audit trail. */
  readonly email: string;
  readonly linkedAt: number;
}

interface LinksFile {
  readonly version: 1;
  readonly links: readonly IdentityLink[];
}

export interface IdpUser {
  readonly sub: string;
  readonly email: string;
  readonly emailVerified: boolean;
}

export type RelinkDecision =
  | { kind: "linked"; email: string; identity: string; principal: string }
  | { kind: "kept"; email: string; identity: string; principal: string }
  | { kind: "refused"; email: string; principal: string; reason: string };

export interface RelinkPlan {
  readonly links: readonly IdentityLink[];
  readonly decisions: readonly RelinkDecision[];
}

const isLink = (v: unknown): v is IdentityLink => {
  if (typeof v !== "object" || v === null) return false;
  const r: Record<string, unknown> = Object.fromEntries(Object.entries(v));
  return (
    typeof r.identity === "string" &&
    typeof r.principal === "string" &&
    typeof r.email === "string" &&
    typeof r.linkedAt === "number"
  );
};

function readLinks(path: string): readonly IdentityLink[] {
  if (!existsSync(path)) return [];
  // A file that is there but unreadable throws, on purpose: carrying on without it would show every
  // linked person an empty dashboard, and whatever they made next would be stranded once it was fixed.
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  const file = typeof parsed === "object" && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
  const links = file.links;
  if (file.version !== 1 || !Array.isArray(links) || !links.every(isLink)) {
    throw new Error(`${path} is not an identity links file (version 1).`);
  }
  if (new Set(links.map((l) => l.identity)).size !== links.length) {
    throw new Error(`${path} links one identity twice.`);
  }
  return links;
}

/** identity -> principal. An absent file is no links; a malformed one throws. */
export function loadIdentityLinks(path: string): IdentityLinks {
  return new Map(readLinks(path).map((l) => [l.identity, l.principal]));
}

const normalEmail = (email: string) => email.trim().toLowerCase();

/**
 * Which new identity is which old principal. Pure: it reads nothing and writes nothing, so a dry run
 * shows exactly what --apply would do. A link is made only when both emails are verified and each
 * side has exactly one account with that email; anything else is refused with the reason.
 */
export function planRelink(input: {
  oldIssuer: string;
  newIssuer: string;
  oldUsers: readonly IdpUser[];
  newUsers: readonly IdpUser[];
  existing: IdentityLinks;
  /** Whether an id already owns calendars or requests in the stores. */
  ownsAnything: (principalId: string) => boolean;
  now: number;
}): RelinkPlan {
  const withEmail = (users: readonly IdpUser[], email: string) => users.filter((u) => normalEmail(u.email) === email);
  const linkedIdentities = new Set(input.existing.keys());

  const decisions = [...input.oldUsers]
    .sort((a, b) => normalEmail(a.email).localeCompare(normalEmail(b.email)))
    .map((old): RelinkDecision => {
      const email = normalEmail(old.email);
      const principal = `${input.oldIssuer}#${old.sub}`;
      const refuse = (reason: string): RelinkDecision => ({ kind: "refused", email, principal, reason });
      if (!old.emailVerified) return refuse("the old account's email is not verified");
      const olds = withEmail(input.oldUsers, email);
      if (olds.length > 1) return refuse(`${olds.length} old accounts have this email`);
      const matches = withEmail(input.newUsers, email);
      const [match] = matches;
      if (!match) return refuse("no account in the new environment has this email");
      if (matches.length > 1) return refuse(`${matches.length} new accounts have this email`);
      if (!match.emailVerified) return refuse("the new account's email is not verified");

      const identity = `${input.newIssuer}#${match.sub}`;
      if (identity === principal) return refuse("the new account is the old one; there is nothing to link");
      const current = input.existing.get(identity);
      if (current === principal) return { kind: "kept", email, identity, principal };
      if (current !== undefined) return refuse("the new account is already linked to another principal");
      if (linkedIdentities.has(principal)) return refuse("the old account is itself linked to another principal");
      if (input.ownsAnything(identity)) return refuse("the new account already owns calendars or requests under its own id");
      return { kind: "linked", email, identity, principal };
    });

  return {
    decisions,
    links: decisions.flatMap((d) =>
      d.kind === "linked" ? [{ identity: d.identity, principal: d.principal, email: d.email, linkedAt: input.now }] : []
    ),
  };
}

/**
 * Write a plan: its links beside the ones already in the file (never replacing one), through a
 * sibling file and a rename so a crash leaves the old file or the new one, never half of either; then
 * every decision, linked or refused, appended to the log.
 */
export function applyRelink(input: { linksPath: string; logPath: string; plan: RelinkPlan; at: number }): void {
  const before = readLinks(input.linksPath);
  const taken = new Set(before.map((l) => l.identity));
  const file: LinksFile = { version: 1, links: [...before, ...input.plan.links.filter((l) => !taken.has(l.identity))] };
  const dir = dirname(input.linksPath);
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${input.linksPath}.tmp`;
  writeFileSync(tmp, JSON.stringify(file, null, 2));
  renameSync(tmp, input.linksPath);
  appendFileSync(input.logPath, input.plan.decisions.map((d) => `${JSON.stringify({ at: input.at, ...d })}\n`).join(""));
}

/** Where the running app keeps its links, normalised once: blank means the default. */
export const identityLinksPath = (): string => process.env.IDENTITY_LINKS_PATH?.trim() || "./data/identity-links.json";

const shared = globalThis as typeof globalThis & { __deltatIdentityLinks?: IdentityLinks };

/** The process's links, read once at first use (a new link takes a restart, by design: step 4). */
export function liveIdentityLinks(): IdentityLinks {
  return (shared.__deltatIdentityLinks ??= loadIdentityLinks(identityLinksPath()));
}
