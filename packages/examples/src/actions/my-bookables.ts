"use server";

import { dtPublic } from "../lib/deltat";
import { publicRegistry } from "../lib/public-registry";
import type { BookableRecord } from "../lib/public-bookables";
import * as service from "../lib/bookable-service";
import { createRateLimiter } from "../lib/rate-limit";
import { getSessionPrincipal } from "../lib/workos-session";
import { DEFAULT_WEEK } from "../examples/builder/schedule";
import type { CreateBookableResult } from "./public-bookables";

// The signed-in twin of actions/public-bookables: same service, same tenant, but the caller is a
// verified principal instead of an IP with a secret link. Ownership is the principal id, so "my
// calendars" is a registry query rather than a bookmark the user must not lose.

const perPrincipalCreates = createRateLimiter({ limit: 10, windowMs: 3_600_000 });

const deps = { dt: dtPublic, registry: publicRegistry };

export async function createMyBookable(input: {
  name: string;
  timezone: string;
}): Promise<CreateBookableResult> {
  const principal = await getSessionPrincipal();
  if (!principal) return { ok: false, error: "Sign in to create a scheduler." };

  const gate = perPrincipalCreates.check(principal.principalId);
  if (!gate.allowed) {
    const minutes = Math.max(1, Math.ceil(gate.retryAfterMs / 60_000));
    return { ok: false, error: `That is ten new schedulers in an hour. Try again in ${minutes} minutes.` };
  }

  const created = await service.createBookable(
    deps,
    // The one-field onboarding: name it, get a working scheduler on a sane default week
    // (weekday blocks, 30-minute slots), then tune hours on the manage page.
    { name: input.name, slotMinutes: 30, timezone: input.timezone, week: DEFAULT_WEEK },
    { owner: principal.principalId }
  );
  if (!created.ok) return created;
  return { ok: true, ...created.value };
}

/** Every scheduler the signed-in user created, newest first. Empty when signed out. */
export async function myBookables(): Promise<BookableRecord[]> {
  const principal = await getSessionPrincipal();
  if (!principal) return [];
  return publicRegistry.listOwned(principal.principalId);
}

/** Who is signed in, for the page header. Null when signed out. */
export async function whoAmI(): Promise<{ sub: string } | null> {
  const principal = await getSessionPrincipal();
  return principal?.sub ? { sub: principal.sub } : null;
}
