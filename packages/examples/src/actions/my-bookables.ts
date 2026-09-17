"use server";

import { dtPublic } from "../lib/deltat";
import { publicRegistry } from "../lib/public-registry";
import type { BookableRecord } from "../lib/public-bookables";
import * as service from "../lib/bookable-service";
import { createRateLimiter } from "../lib/rate-limit";
import { getSessionPrincipal } from "../lib/auth-session";
import { getSchedulerTemplate } from "../lib/scheduler-templates";
import type { CreateBookableResult } from "./public-bookables";

// The signed-in twin of actions/public-bookables: same service, same tenant, but the caller is a
// verified principal instead of an IP with a secret link. Ownership is the principal id, so the
// dashboard lists your schedulers and a lost manage link is no longer a lost calendar.

const perPrincipalCreates = createRateLimiter({ limit: 20, windowMs: 3_600_000 });

const deps = { dt: dtPublic, registry: publicRegistry };

/** Instantiate a scheduler template as a real, owned bookable. Returns the manage link once. */
export async function createFromTemplate(input: {
  templateId: string;
  name?: string;
  timezone?: string;
}): Promise<CreateBookableResult> {
  const principal = await getSessionPrincipal();
  if (!principal) return { ok: false, error: "Sign in to create a scheduler." };

  const template = getSchedulerTemplate(input.templateId);
  if (!template) return { ok: false, error: "That template does not exist." };

  const gate = perPrincipalCreates.check(principal.principalId);
  if (!gate.allowed) {
    const minutes = Math.max(1, Math.ceil(gate.retryAfterMs / 60_000));
    return { ok: false, error: `That is twenty new schedulers in an hour. Try again in ${minutes} minutes.` };
  }

  const name = (input.name?.trim() || template.defaultName).slice(0, 60);
  const timezone = input.timezone?.trim() || "UTC";
  const created = await service.createBookable(
    deps,
    { name, slotMinutes: template.slotMinutes, timezone, week: template.week },
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

/** Who is signed in, for the dashboard header. Null when signed out. */
export async function whoAmI(): Promise<{ sub: string } | null> {
  const principal = await getSessionPrincipal();
  return principal?.sub ? { sub: principal.sub } : null;
}
