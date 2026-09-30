"use server";

import { dtPublic } from "../lib/deltat";
import { publicRegistry } from "../lib/public-registry";
import type { BookableRecord } from "../lib/public-bookables";
import * as owned from "../lib/owned-calendar-service";
import type { AvailabilityInput, CalendarView } from "../lib/owned-calendar-service";
import type { Outcome } from "../lib/bookable-service";
import { createRateLimiter } from "../lib/rate-limit";
import { getSessionPrincipal } from "../lib/auth-session";

// The signed-in calendar surface: the full round-trip (create, read, set availability, rename,
// cancel a booking, delete) for calendars a verified principal owns. Same public tenant as the
// anonymous secret-link flow, but authorized by the principal, so the dashboard lists your
// calendars and nothing depends on keeping a link.

const perPrincipalCreates = createRateLimiter({ limit: 20, windowMs: 3_600_000 });
// Saving availability expands a week into rules; cap it so a script cannot hammer replaceOpenHours.
const perPrincipalSaves = createRateLimiter({ limit: 120, windowMs: 3_600_000 });

const deps = { dt: dtPublic, registry: publicRegistry };

async function owner(): Promise<string | null> {
  return (await getSessionPrincipal())?.principalId ?? null;
}

export type CreateCalendarResult = { ok: true; id: string } | { ok: false; error: string };

/** Create an empty calendar; the caller then sets its availability. */
export async function createCalendar(input: {
  name: string;
  timezone: string;
}): Promise<CreateCalendarResult> {
  const o = await owner();
  if (!o) return { ok: false, error: "Sign in to create a calendar." };

  const gate = perPrincipalCreates.check(o);
  if (!gate.allowed) {
    const minutes = Math.max(1, Math.ceil(gate.retryAfterMs / 60_000));
    return { ok: false, error: `That is twenty new calendars in an hour. Try again in ${minutes} minutes.` };
  }

  const created = await owned.createOwnedCalendar(deps, { name: input.name, timezone: input.timezone, owner: o });
  if (!created.ok) return created;
  return { ok: true, id: created.value.id };
}

export async function getCalendar(id: string): Promise<Outcome<CalendarView>> {
  const o = await owner();
  if (!o) return { ok: false, error: "Sign in to manage a calendar." };
  return owned.getOwnedCalendar(deps, { id, owner: o });
}

export async function saveCalendarAvailability(
  id: string,
  input: AvailabilityInput
): Promise<Outcome<BookableRecord>> {
  const o = await owner();
  if (!o) return { ok: false, error: "Sign in to edit availability." };
  const gate = perPrincipalSaves.check(o);
  if (!gate.allowed) {
    const minutes = Math.max(1, Math.ceil(gate.retryAfterMs / 60_000));
    return { ok: false, error: `Too many saves. Try again in ${minutes} minutes.` };
  }
  return owned.saveAvailability(deps, { id, owner: o, ...input });
}

/** Toggle whether a visitor must be signed in to book (reading the schedule stays public). */
export async function setRequireLoginToBook(
  id: string,
  required: boolean
): Promise<Outcome<BookableRecord>> {
  const o = await owner();
  if (!o) return { ok: false, error: "Sign in to change this." };
  const updated = publicRegistry.updateOwned(id, o, { requireLoginToBook: required });
  if (!updated) return { ok: false, error: "You do not own this calendar." };
  return { ok: true, value: updated };
}

export async function renameCalendar(id: string, name: string): Promise<Outcome<BookableRecord>> {
  const o = await owner();
  if (!o) return { ok: false, error: "Sign in to rename a calendar." };
  return owned.renameOwnedCalendar(deps, { id, owner: o, name });
}

export async function cancelCalendarBooking(id: string, bookingId: string): Promise<Outcome<null>> {
  const o = await owner();
  if (!o) return { ok: false, error: "Sign in to cancel a booking." };
  return owned.cancelOwnedBooking(deps, { id, owner: o, bookingId });
}

export async function deleteCalendar(id: string): Promise<Outcome<null>> {
  const o = await owner();
  if (!o) return { ok: false, error: "Sign in to delete a calendar." };
  return owned.deleteOwnedCalendar(deps, { id, owner: o });
}

/** Every calendar the signed-in user owns, newest first. Empty when signed out. */
export async function myBookables(): Promise<BookableRecord[]> {
  const o = await owner();
  if (!o) return [];
  return publicRegistry.listOwned(o);
}

/** Who is signed in, for the dashboard header. Null when signed out. */
export async function whoAmI(): Promise<{ sub: string } | null> {
  const principal = await getSessionPrincipal();
  return principal?.sub ? { sub: principal.sub } : null;
}
