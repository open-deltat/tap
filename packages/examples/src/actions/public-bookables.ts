"use server";

import { dtPublic } from "../lib/deltat";
import { publicRegistry } from "../lib/public-registry";
import type { BookableRecord } from "../lib/public-bookables";
import * as service from "../lib/bookable-service";
import type { CreateBookableInput, CreatedBookable, Outcome } from "../lib/bookable-service";
import { createRateLimiter } from "../lib/rate-limit";
import { callerIp } from "../lib/caller";
import type { WeekHours } from "../examples/builder/schedule";

// The edge over `lib/bookable-service`. Anyone on the internet can call these, so this layer owns
// the two things that need a request to exist: who is calling, and whether they have called too
// often. Everything else is the service, which is driven against a real deltat in the integration
// suite.

const deps = { dt: dtPublic, registry: publicRegistry };

const perCallerCreates = createRateLimiter({ limit: 3, windowMs: 3_600_000 });
// x-forwarded-for is forgeable, so a per-caller cap alone bounds the polite majority and nothing
// else. This bucket is what an attacker with fresh addresses still runs into.
const siteWideCreates = createRateLimiter({ limit: 120, windowMs: 3_600_000 });

export type CreateBookableResult =
  | { ok: true; id: string; name: string; manageKey: string }
  | { ok: false; error: string };

export type ManageResult<T> = Outcome<T>;

export async function createPublicBookable(
  input: CreateBookableInput & { week: WeekHours }
): Promise<CreateBookableResult> {
  const caller = perCallerCreates.check(await callerIp());
  if (!caller.allowed) {
    const minutes = Math.max(1, Math.ceil(caller.retryAfterMs / 60_000));
    return { ok: false, error: `That is three new bookables in an hour from here. Try again in ${minutes} minutes.` };
  }
  if (!siteWideCreates.check("site").allowed) {
    return { ok: false, error: "The site is creating bookables faster than it can keep up with. Try again shortly." };
  }

  const created: Outcome<CreatedBookable> = await service.createBookable(deps, input);
  if (!created.ok) return created;
  return { ok: true, ...created.value };
}

export async function getPublicBookable(id: string): Promise<BookableRecord | undefined> {
  return publicRegistry.get(id);
}

/** Does this key open this bookable? Lets the manage route render a plain 404 instead of a broken page. */
export async function authorizePublicBookable(
  id: string,
  manageKey: string
): Promise<BookableRecord | undefined> {
  return publicRegistry.authorize(id, manageKey);
}

export async function renamePublicBookable(
  id: string,
  manageKey: string,
  name: string
): Promise<Outcome<BookableRecord>> {
  return service.renameBookable(deps, id, manageKey, name);
}

export async function deletePublicBookable(id: string, manageKey: string): Promise<Outcome<null>> {
  return service.deleteBookable(deps, id, manageKey);
}
