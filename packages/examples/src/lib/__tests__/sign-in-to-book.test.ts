import { expect, test } from "bun:test";
import { holdNeedsSignIn } from "../bookable-service";

// "Booking needs an account" is checked where a hold is placed, never only in the UI. The /ws bridge
// cannot see the site session, so it asks the same question with signedIn = false and refuses: an
// unauthenticated hold must never land where the owner asked for sign-in.

const record = (requireLoginToBook: boolean) => ({ requireLoginToBook });

test("a calendar that needs sign-in refuses a hold from someone signed out", () => {
  expect(holdNeedsSignIn(record(true), false)).toBe(true);
});

test("it lets the signed-in through, and anyone through where sign-in is off", () => {
  expect(holdNeedsSignIn(record(true), true)).toBe(false);
  expect(holdNeedsSignIn(record(false), false)).toBe(false);
});

test("an unknown calendar is not this gate's call (the hold path refuses it as gone)", () => {
  expect(holdNeedsSignIn(undefined, false)).toBe(false);
});
