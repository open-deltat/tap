"use server";

import { expandRecurrence } from "@open-deltat/client";
import { dtPublic } from "../lib/deltat";
import { publicRegistry } from "../lib/public-registry";
import {
  MAX_PUBLIC_BOOKABLES,
  normalizeBookableName,
  type BookableRecord,
} from "../lib/public-bookables";
import { createRateLimiter } from "../lib/rate-limit";
import { callerIp } from "../lib/caller";
import { dateRangeFromToday, weekToRanges, type WeekHours } from "../examples/builder/schedule";

// Anyone on the internet can call these. The trust boundary is here: this app holds the only deltat
// credential, so a stranger never speaks to the database, and ownership of what they create is a
// secret this app mints and only ever stores hashed.

/** How far ahead a new bookable's open hours are written as concrete rules. */
const HORIZON_DAYS = 60;

const ALLOWED_SLOT_MINUTES: readonly number[] = [15, 30, 60, 90, 120];

/** Two blocks a day is a generous week. Uncapped, one form post becomes tens of thousands of rules. */
const MAX_WEEK_RANGES = 14;

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

const perCallerCreates = createRateLimiter({ limit: 3, windowMs: 3_600_000 });
const siteWideCreates = createRateLimiter({ limit: 120, windowMs: 3_600_000 });

export type CreateBookableResult =
  | { ok: true; id: string; name: string; manageKey: string }
  | { ok: false; error: string };

export type ManageResult<T> = { ok: true; value: T } | { ok: false; error: string };

interface ValidCreateInput {
  name: string;
  slotMinutes: number;
  timezone: string;
  ranges: { dow: number; startTime: string; endTime: string }[];
}

function isKnownTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** The name rules live in the registry module and throw; the action surface answers in results. */
function validateName(raw: string): ManageResult<string> {
  try {
    return { ok: true, value: normalizeBookableName(raw) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "That name will not work." };
  }
}

function validateCreateInput(input: {
  name: string;
  slotMinutes: number;
  timezone: string;
  week: WeekHours;
}): ManageResult<ValidCreateInput> {
  const name = validateName(input.name);
  if (!name.ok) return name;

  if (!ALLOWED_SLOT_MINUTES.includes(input.slotMinutes)) {
    return { ok: false, error: `Pick a slot length of ${ALLOWED_SLOT_MINUTES.join(", ")} minutes.` };
  }
  if (!isKnownTimeZone(input.timezone)) {
    return { ok: false, error: "That time zone is not one this server recognises." };
  }

  const ranges = weekToRanges(input.week);
  if (ranges.length === 0) {
    return { ok: false, error: "Open at least one block of hours, or nobody can book anything." };
  }
  if (ranges.length > MAX_WEEK_RANGES) {
    return { ok: false, error: `That is more than ${MAX_WEEK_RANGES} blocks of open hours in a week.` };
  }
  if (!ranges.every((r) => TIME_OF_DAY.test(r.startTime) && TIME_OF_DAY.test(r.endTime))) {
    return { ok: false, error: "Those opening times are not readable as HH:MM." };
  }

  return {
    ok: true,
    value: { name: name.value, slotMinutes: input.slotMinutes, timezone: input.timezone, ranges },
  };
}

export async function createPublicBookable(input: {
  name: string;
  slotMinutes: number;
  timezone: string;
  week: WeekHours;
}): Promise<CreateBookableResult> {
  const caller = perCallerCreates.check(await callerIp());
  if (!caller.allowed) {
    const minutes = Math.max(1, Math.ceil(caller.retryAfterMs / 60_000));
    return { ok: false, error: `That is three new bookables in an hour from here. Try again in ${minutes} minutes.` };
  }
  if (!siteWideCreates.check("site").allowed) {
    return { ok: false, error: "The site is creating bookables faster than it can keep up with. Try again shortly." };
  }
  if (publicRegistry.count() >= MAX_PUBLIC_BOOKABLES) {
    return { ok: false, error: "The public registry is full. Nothing new can be created right now." };
  }

  const validated = validateCreateInput(input);
  if (!validated.ok) return validated;
  const { name, slotMinutes, timezone, ranges } = validated.value;

  const { fromDate, toDate } = dateRangeFromToday(HORIZON_DAYS);
  const segments = ranges.flatMap((range) =>
    expandRecurrence({
      daysOfWeek: [range.dow],
      startTime: range.startTime,
      endTime: range.endTime,
      fromDate,
      toDate,
      timeZone: timezone,
      blocking: false,
    })
  );
  if (segments.length === 0) {
    return { ok: false, error: "Those hours do not land on any day in the next 60 days." };
  }

  const resource = await dtPublic.resources.create({ name });
  try {
    await dtPublic.rules.create(
      segments.map((s) => ({ resourceId: resource.id, start: s.start, end: s.end, blocking: false }))
    );
    const { manageKey } = publicRegistry.register({ id: resource.id, name, slotMinutes, timezone });
    return { ok: true, id: resource.id, name, manageKey };
  } catch (err) {
    // Compensate. A resource the registry never learned about is unownable: nobody can rename it,
    // nobody can delete it, and it would sit in the tenant forever. Rolling it back leaves the
    // caller with an error instead of a ghost.
    await dtPublic.resources.delete(resource.id).catch(() => {});
    console.error("createPublicBookable failed after the resource was created:", err);
    return { ok: false, error: "Something broke while setting that up. Nothing was created." };
  }
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
): Promise<ManageResult<BookableRecord>> {
  try {
    const renamed = publicRegistry.rename(id, manageKey, name);
    if (!renamed) return { ok: false, error: "That manage link does not open this bookable." };
    // deltat keeps its own copy of the name, so the two would drift and the owner would see the old
    // one on every read that goes to the database rather than the registry.
    await dtPublic.resources.update(id, { name: renamed.name });
    return { ok: true, value: renamed };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "That name will not work." };
  }
}

export async function deletePublicBookable(id: string, manageKey: string): Promise<ManageResult<null>> {
  if (!publicRegistry.authorize(id, manageKey)) {
    return { ok: false, error: "That manage link does not open this bookable." };
  }
  // deltat first: if this throws, the registry entry survives and the owner can retry. The reverse
  // order would strand the resource with nobody holding a key to it.
  await dtPublic.resources.delete(id);
  publicRegistry.unregister(id, manageKey);
  return { ok: true, value: null };
}
