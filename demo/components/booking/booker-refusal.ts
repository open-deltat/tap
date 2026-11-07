import type { DayKey } from "./open-days";

/** What the booker shows in place of the slots when a hold needs an account. */
export const SIGN_IN_TO_BOOK = "Sign in to book this time.";

export type Refusal = { kind: "sign-in" } | { kind: "message"; text: string };

// A code is for programs: capitals and underscores, no spaces. The server's sentences for people
// always have a space in them.
const isCode = (error: string) => !error.includes(" ") && error === error.toUpperCase();

/** A refused hold or booking, as the person reads it. Never the raw code. */
export function refusalOf(error: string): Refusal {
  if (error === "SIGN_IN_REQUIRED") return { kind: "sign-in" };
  if (isCode(error)) return { kind: "message", text: "That did not work. Pick the time again." };
  return { kind: "message", text: error };
}

/** Sign in, then come back to this calendar on this day. */
export function signInHref(calendarId: string, day: DayKey): string {
  return `/auth/login?returnTo=${encodeURIComponent(`/b/${calendarId}?day=${day}`)}`;
}
