import { expect, test } from "bun:test";
import { prefillFrom } from "./prefill";

// A signed-in visitor should not retype who they are: the booking form starts from the name and email
// the identity provider gave for their session. Signed out, it starts empty.

test("signed in: the form starts with the session's name and email", () => {
  expect(prefillFrom({ name: "Anna Example", email: "anna@example.com", emailVerified: true })).toEqual({ name: "Anna Example", email: "anna@example.com" });
});

test("signed in without an email: the name only", () => {
  expect(prefillFrom({ name: "Anna Example", email: null, emailVerified: false })).toEqual({ name: "Anna Example", email: "" });
});

test("signed out: nothing", () => {
  expect(prefillFrom(null)).toEqual({ name: "", email: "" });
});
