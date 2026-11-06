"use server";

import { dtPublic } from "../lib/deltat";
import { publicRegistry } from "../lib/public-registry";
import type { BookableRecord } from "../lib/public-bookables";
import * as service from "../lib/bookable-service";
import type { Outcome } from "../lib/bookable-service";
import { createRateLimiter } from "../lib/rate-limit";
import { callerIp } from "../lib/caller";

// The edge over `lib/bookable-service` for bookables made by the old anonymous form: read one, and
// rename or delete it with its secret manage link. Anyone on the internet can call these, so this
// layer owns who is calling and how often.
//
// There is no create here any more. Calendars are created only through the hosted MCP
// (create_calendar); the bookables made before that keep working through their links.

const deps = { dt: dtPublic, registry: publicRegistry };

export type ManageResult<T> = Outcome<T>;

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

// Manage-key writes are authorized, but the key is guessable-in-principle and these do real work
// (a rename writes the registry and deltat; a delete destroys a calendar), so they carry the same
// per-caller bound as every other public write rather than relying on authorization alone.
const perCallerManageWrites = createRateLimiter({ limit: 30, windowMs: 3_600_000 });

async function manageWriteAllowed(): Promise<boolean> {
  return perCallerManageWrites.check(await callerIp()).allowed;
}

export async function renamePublicBookable(
  id: string,
  manageKey: string,
  name: string
): Promise<Outcome<BookableRecord>> {
  if (!(await manageWriteAllowed())) {
    return { ok: false, error: "Too many changes from here just now. Give it a minute." };
  }
  return service.renameBookable(deps, id, manageKey, name);
}

export async function deletePublicBookable(id: string, manageKey: string): Promise<Outcome<null>> {
  if (!(await manageWriteAllowed())) {
    return { ok: false, error: "Too many changes from here just now. Give it a minute." };
  }
  return service.deleteBookable(deps, id, manageKey);
}
