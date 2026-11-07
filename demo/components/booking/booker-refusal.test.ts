import { describe, expect, test } from "bun:test";
import { refusalOf, signInHref, SIGN_IN_TO_BOOK } from "./booker-refusal";
import { openingDay, slotsByDay } from "./open-days";

// A signed-in owner picked a time on their own calendar and got a toast saying "SIGN_IN_REQUIRED".
// A person never sees a code: a sign-in refusal becomes a way forward in the booker, and any other
// code becomes plain words.

describe("what the booker says when a hold is refused", () => {
  test("sign-in required is a way forward, not a message", () => {
    expect(refusalOf("SIGN_IN_REQUIRED")).toEqual({ kind: "sign-in" });
    expect(SIGN_IN_TO_BOOK).toBe("Sign in to book this time.");
  });

  test("a sentence the server wrote for people passes through", () => {
    const text = "Someone else is holding that slot right now. Pick another.";
    expect(refusalOf(text)).toEqual({ kind: "message", text });
  });

  test("any other code becomes plain words, never the code", () => {
    const refused = refusalOf("UNAVAILABLE");
    expect(refused.kind).toBe("message");
    expect(JSON.stringify(refused)).not.toContain("UNAVAILABLE");
  });
});

describe("signing in comes back to the same page and day", () => {
  test("the link returns to this calendar with the day picked", () => {
    const href = signInHref("01CAL", "2036-01-07");
    const url = new URL(href, "https://delt.at");
    expect(url.pathname).toBe("/auth/login");
    expect(url.searchParams.get("returnTo")).toBe("/b/01CAL?day=2036-01-07");
  });

  test("the page reopens on that day when it is still open, else on the first open day", () => {
    const HOUR = 3_600_000;
    const mon = Date.UTC(2036, 0, 7, 9);
    const tue = Date.UTC(2036, 0, 8, 9);
    const byDay = slotsByDay([{ start: mon, end: mon + HOUR }, { start: tue, end: tue + HOUR }], 30 * 60_000, Date.UTC(2036, 0, 5), "Europe/Berlin");
    expect(openingDay(byDay, "2036-01-05", "2036-01-08")).toBe("2036-01-08");
    expect(openingDay(byDay, "2036-01-05", "2036-01-09")).toBe("2036-01-07");
    expect(openingDay(byDay, "2036-01-05", null)).toBe("2036-01-07");
  });
});
