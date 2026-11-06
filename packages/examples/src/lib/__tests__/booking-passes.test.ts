import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { openBookingPassStore } from "../booking-passes";
import { MAX_LIVE_HOLDS_PER_PASS, PASS_NOT_VALID } from "../booking-pass-service";
import { HOLD_TTL_MS, HORIZON_DAYS } from "../bookable-service";
import { BEN, MIN, NOW, OWNER, T, tmpPath } from "./meeting-fixtures";
import { GUEST, STRANGER, setupPasses as setup } from "./pass-fixtures";

const DAY = 24 * 60 * MIN;
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** Unwraps an Outcome a test expects to succeed, failing with its message otherwise. */
function must<T>(outcome: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!outcome.ok) throw new Error(`expected ok, got: ${outcome.error}`);
  return outcome.value;
}

describe("minting a pass", () => {
  test("hands out a dtp_ pass of 32 random bytes once and stores only its SHA-256", () => {
    const { mint, storePath, passes } = setup();
    const { token, pass } = mint();
    expect(token.startsWith("dtp_")).toBe(true);
    expect(Buffer.from(token.slice(4), "base64url")).toHaveLength(32);
    expect(mint().token).not.toBe(token);

    const file = readFileSync(storePath, "utf-8");
    expect(file).not.toContain(token);
    expect(file).not.toContain(token.slice(4));
    expect(file).toContain(sha256(token));

    // Defaults: one use, fifteen minutes, the calendar's slot length.
    expect(pass).toMatchObject({ uses: 1, usesLeft: 1, status: "active", lengthsMinutes: [30], expiresAt: NOW + 15 * MIN });
    expect(JSON.stringify(must(passes.list({ owner: OWNER })))).not.toContain(token);
  });

  test("only the calendar's owner can mint one, and a missing calendar reads the same", () => {
    const { passes } = setup();
    const base = { from: T, to: T + 60 * MIN };
    const ben = passes.create({ owner: BEN, calendarId: "cal1", ...base });
    const ghost = passes.create({ owner: OWNER, calendarId: "nope", ...base });
    expect(ben).toEqual({ ok: false, error: "You do not own this calendar." });
    expect(ghost).toEqual(ben);
  });

  test("refuses a scope outside the rules: window, uses, expiry, lengths", () => {
    const { passes } = setup();
    const base = { owner: OWNER, calendarId: "cal1", from: T, to: T + 60 * MIN };
    for (const bad of [
      { from: T, to: T },
      { from: T, to: T - MIN },
      { from: NOW - 2 * DAY, to: NOW - DAY },
      { from: T, to: NOW + (HORIZON_DAYS + 1) * DAY },
      { uses: 0 },
      { uses: 11 },
      { uses: 1.5 },
      { expiresInMinutes: 0 },
      { expiresInMinutes: 7 * 24 * 60 + 1 },
      { lengthsMinutes: [] },
      { lengthsMinutes: [0] },
      { lengthsMinutes: [481] },
      { lengthsMinutes: [22.5] },
      { label: "\u0000" },
    ]) {
      expect(passes.create({ ...base, ...bad }).ok).toBe(false);
    }
    const widest = passes.create({ ...base, uses: 10, expiresInMinutes: 7 * 24 * 60, lengthsMinutes: [60, 30, 30], label: "for Acme's agent" });
    expect(must(widest).pass).toMatchObject({ uses: 10, lengthsMinutes: [30, 60], label: "for Acme's agent", expiresAt: NOW + 7 * DAY });
  });

  test("the owner lists passes without the pass itself and can revoke one; nobody else can do either", async () => {
    const { mint, passes } = setup();
    const { pass } = mint({ label: "for Acme" });
    expect(must(passes.list({ owner: OWNER, calendarId: "cal1" }))).toEqual([expect.objectContaining({ id: pass.id, status: "active", usesLeft: 1, label: "for Acme" })]);
    expect(passes.list({ owner: BEN, calendarId: "cal1" }).ok).toBe(false);
    expect(must(passes.list({ owner: BEN }))).toEqual([]);

    expect((await passes.revoke({ owner: BEN, passId: pass.id })).ok).toBe(false);
    expect(must(await passes.revoke({ owner: OWNER, passId: pass.id })).status).toBe("revoked");
    expect((await passes.revoke({ owner: OWNER, passId: pass.id })).ok).toBe(false);
  });
});

describe("booking with a pass", () => {
  test("finds free time inside the pass window only, never outside it", async () => {
    const { mint, passes } = setup();
    const { token } = mint();
    const found = must(await passes.findTimes({ token, caller: GUEST }));
    expect(found.free).toEqual([{ start: T, end: T + 240 * MIN }]);
    expect(found.scope).toMatchObject({ calendar: { id: "cal1", name: "Simon's week", timezone: "Europe/Berlin" }, usesLeft: 1, lengthsMinutes: [30] });

    // Asking wider is clipped to the pass; asking narrower narrows.
    const wide = must(await passes.findTimes({ token, caller: GUEST, from: NOW, to: NOW + 6 * DAY }));
    expect(wide.free).toEqual([{ start: T, end: T + 240 * MIN }]);
    const narrow = must(await passes.findTimes({ token, caller: GUEST, from: T + 60 * MIN, to: T + 90 * MIN }));
    expect(narrow.free).toEqual([{ start: T + 60 * MIN, end: T + 90 * MIN }]);
    expect(must(await passes.findTimes({ token, caller: GUEST, from: T + 300 * MIN, to: T + 400 * MIN })).free).toEqual([]);
  });

  test("holds only an allowed length inside the window, for minutes, never past the pass", async () => {
    const { mint, passes, state, clock } = setup();
    const { token } = mint({ lengthsMinutes: [30, 60] });
    expect((await passes.hold({ token, caller: GUEST, start: T })).ok).toBe(false); // two lengths: say which
    expect((await passes.hold({ token, caller: GUEST, start: T, lengthMinutes: 45 })).ok).toBe(false);
    expect((await passes.hold({ token, caller: GUEST, start: T - 30 * MIN, lengthMinutes: 30 })).ok).toBe(false);
    expect((await passes.hold({ token, caller: GUEST, start: T + 210 * MIN, lengthMinutes: 60 })).ok).toBe(false);
    state.free = [];
    expect((await passes.hold({ token, caller: GUEST, start: T, lengthMinutes: 30 })).ok).toBe(false); // not free
    expect(state.placed).toEqual([]);

    state.free = [{ start: NOW, end: NOW + 7 * DAY }];
    const held = must(await passes.hold({ token, caller: GUEST, start: T + 180 * MIN, lengthMinutes: 60 }));
    expect(held).toMatchObject({ start: T + 180 * MIN, end: T + 240 * MIN, expiresAt: NOW + HOLD_TTL_MS });
    expect(state.placed).toEqual([{ id: held.holdId, start: T + 180 * MIN, end: T + 240 * MIN, expiresAt: NOW + HOLD_TTL_MS }]);

    // A hold never outlives the pass it was made under.
    const short = mint({ expiresInMinutes: 2 });
    clock.now += MIN;
    expect(must(await passes.hold({ token: short.token, caller: GUEST, start: T })).expiresAt).toBe(NOW + 2 * MIN);
  });

  test(`at most ${MAX_LIVE_HOLDS_PER_PASS} live holds per pass, even when asked for at once`, async () => {
    const { mint, passes, state } = setup();
    const { token } = mint();
    state.latencyMs = 10;
    const tries = await Promise.all([0, 30, 60].map((offset) => passes.hold({ token, caller: GUEST, start: T + offset * MIN })));
    expect(tries.filter((t) => t.ok)).toHaveLength(MAX_LIVE_HOLDS_PER_PASS);
    expect(state.placed).toHaveLength(MAX_LIVE_HOLDS_PER_PASS);

    const first = tries.find((t) => t.ok);
    if (!first?.ok) throw new Error("no hold");
    must(await passes.release({ token, caller: GUEST, holdId: first.value.holdId }));
    expect(state.released).toEqual([first.value.holdId]);
    expect((await passes.hold({ token, caller: GUEST, start: T + 90 * MIN })).ok).toBe(true);
  });

  test("books a hold made with the pass, under the given name, and the pass is spent", async () => {
    const { mint, passes, state } = setup();
    const { token, pass } = mint();
    const keep = must(await passes.hold({ token, caller: GUEST, start: T }));
    const spare = must(await passes.hold({ token, caller: GUEST, start: T + 60 * MIN }));
    const booked = must(await passes.book({ token, caller: GUEST, holdId: keep.holdId, bookedBy: "Anna from Acme", note: "Intro call" }));
    expect(booked).toMatchObject({ bookingId: "booking1", start: T, end: T + 30 * MIN, usesLeft: 0 });
    expect(state.bookings).toEqual([{ id: "booking1", label: "Anna from Acme" }]);
    expect(state.released).toEqual([spare.holdId]); // the other hold goes back the moment the pass is spent

    expect(await passes.findTimes({ token, caller: GUEST })).toEqual({ ok: false, error: PASS_NOT_VALID });
    expect(must(passes.list({ owner: OWNER }))).toEqual([
      expect.objectContaining({ id: pass.id, status: "spent", usesLeft: 0, bookings: [{ bookingId: "booking1", start: T, end: T + 30 * MIN, bookedBy: "Anna from Acme", note: "Intro call" }] }),
    ]);
  });

  test("a hold id from anywhere but this pass is not bookable or releasable with it", async () => {
    const { mint, passes, state } = setup();
    const a = mint();
    const b = mint();
    const heldA = must(await passes.hold({ token: a.token, caller: GUEST, start: T }));
    for (const holdId of [heldA.holdId, "hold99", "booking1"]) {
      expect((await passes.book({ token: b.token, caller: GUEST, holdId, bookedBy: "Anna" })).ok).toBe(false);
      expect((await passes.release({ token: b.token, caller: GUEST, holdId })).ok).toBe(false);
    }
    expect(state.bookings).toEqual([]);
    expect(state.released).toEqual([]);
    expect(must(passes.list({ owner: OWNER })).map((p) => p.usesLeft)).toEqual([1, 1]);
  });

  test("two bookings on a single-use pass at once: exactly one wins", async () => {
    const { mint, passes, state } = setup();
    const { token } = mint();
    const one = must(await passes.hold({ token, caller: GUEST, start: T }));
    const two = must(await passes.hold({ token, caller: GUEST, start: T + 60 * MIN }));
    state.latencyMs = 20;
    const results = await Promise.all([
      passes.book({ token, caller: GUEST, holdId: one.holdId, bookedBy: "Anna" }),
      passes.book({ token, caller: GUEST, holdId: two.holdId, bookedBy: "Anna again" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(state.bookings).toHaveLength(1);
    expect(must(passes.list({ owner: OWNER }))[0]?.status).toBe("spent");
  });

  test("a pass with three uses books three times, then stops", async () => {
    const { mint, passes, state } = setup();
    const { token } = mint({ uses: 3 });
    for (const [i, offset] of [0, 60, 120].entries()) {
      const held = must(await passes.hold({ token, caller: GUEST, start: T + offset * MIN }));
      expect(must(await passes.book({ token, caller: GUEST, holdId: held.holdId, bookedBy: "Anna" })).usesLeft).toBe(2 - i);
    }
    expect(state.bookings).toHaveLength(3);
    expect(await passes.hold({ token, caller: GUEST, start: T + 180 * MIN })).toEqual({ ok: false, error: PASS_NOT_VALID });
  });

  test("a commit the kernel refuses books nothing and leaves the pass usable", async () => {
    const { mint, passes, state } = setup();
    const { token } = mint();
    const held = must(await passes.hold({ token, caller: GUEST, start: T }));
    state.commitFails = true;
    expect((await passes.book({ token, caller: GUEST, holdId: held.holdId, bookedBy: "Anna" })).ok).toBe(false);
    state.commitFails = false;
    const again = must(await passes.hold({ token, caller: GUEST, start: T }));
    expect(must(await passes.book({ token, caller: GUEST, holdId: again.holdId, bookedBy: "Anna" })).usesLeft).toBe(0);
  });

  test("an expired hold is not booked", async () => {
    const { mint, passes, state, clock } = setup();
    const { token } = mint({ expiresInMinutes: 60 });
    const held = must(await passes.hold({ token, caller: GUEST, start: T }));
    clock.now += HOLD_TTL_MS;
    expect((await passes.book({ token, caller: GUEST, holdId: held.holdId, bookedBy: "Anna" })).ok).toBe(false);
    expect(state.bookings).toEqual([]);
  });

  test("revoking releases the pass's live holds and the pass stops working", async () => {
    const { mint, passes, state } = setup();
    const { token, pass } = mint();
    const held = must(await passes.hold({ token, caller: GUEST, start: T }));
    must(await passes.revoke({ owner: OWNER, passId: pass.id }));
    expect(state.released).toEqual([held.holdId]);
    expect(await passes.book({ token, caller: GUEST, holdId: held.holdId, bookedBy: "Anna" })).toEqual({ ok: false, error: PASS_NOT_VALID });
  });
});

describe("the first agent to hold claims the pass", () => {
  test("after the claim, anyone else gets the generic refusal on every tool; the claimer carries on", async () => {
    const { mint, passes, state } = setup();
    const { token, pass } = mint({ uses: 2 });
    must(await passes.findTimes({ token, caller: STRANGER })); // looking before the claim locks nothing
    const held = must(await passes.hold({ token, caller: GUEST, start: T, name: async () => "Gina Guest" }));

    for (const outcome of [
      await passes.findTimes({ token, caller: STRANGER }),
      await passes.hold({ token, caller: STRANGER, start: T + 60 * MIN }),
      await passes.book({ token, caller: STRANGER, holdId: held.holdId, bookedBy: "Eve" }),
      await passes.release({ token, caller: STRANGER, holdId: held.holdId }),
    ]) {
      expect(outcome).toEqual({ ok: false, error: PASS_NOT_VALID });
    }
    expect(state.bookings).toEqual([]);
    expect(state.released).toEqual([]);

    must(await passes.findTimes({ token, caller: GUEST }));
    expect(must(await passes.book({ token, caller: GUEST, holdId: held.holdId, bookedBy: "Gina" })).usesLeft).toBe(1);
    must(await passes.hold({ token, caller: GUEST, start: T + 60 * MIN }));
    expect(must(passes.list({ owner: OWNER }))).toEqual([expect.objectContaining({ id: pass.id, claimedBy: "Gina Guest" })]);
  });

  test("two agents holding at once on an unclaimed pass: one claims it, the other is refused", async () => {
    const { mint, passes, state } = setup();
    const { token } = mint();
    const slowName = (n: string) => async () => {
      await Bun.sleep(10);
      return n;
    };
    const results = await Promise.all([
      passes.hold({ token, caller: GUEST, start: T, name: slowName("Gina") }),
      passes.hold({ token, caller: STRANGER, start: T + 60 * MIN, name: slowName("Eve") }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: PASS_NOT_VALID }]);
    expect(state.placed).toHaveLength(1);
  });

  test("an unclaimed pass shows no claimer, and a claimer without a shared name shows their sign-in id", async () => {
    const { mint, passes } = setup();
    const { token } = mint();
    expect(must(passes.list({ owner: OWNER }))[0]?.claimedBy).toBeNull();
    must(await passes.hold({ token, caller: GUEST, start: T, name: async () => null }));
    expect(must(passes.list({ owner: OWNER }))[0]?.claimedBy).toBe(GUEST);
  });
});

describe("a pass that is not valid", () => {
  test("wrong, expired, spent and revoked passes all get the same refusal, which never repeats the pass", async () => {
    const { mint, passes, clock } = setup();
    const expired = mint({ expiresInMinutes: 1 });
    const revoked = mint();
    must(await passes.revoke({ owner: OWNER, passId: revoked.pass.id }));
    const spent = mint();
    const held = must(await passes.hold({ token: spent.token, caller: GUEST, start: T }));
    must(await passes.book({ token: spent.token, caller: GUEST, holdId: held.holdId, bookedBy: "Anna" }));
    clock.now += MIN;

    const wrong = `dtp_${Buffer.alloc(32, 7).toString("base64url")}`;
    for (const token of [wrong, "", "dtp_", expired.token, revoked.token, spent.token, `${spent.token}x`]) {
      for (const outcome of [
        await passes.findTimes({ token, caller: GUEST }),
        await passes.hold({ token, caller: GUEST, start: T + 60 * MIN }),
        await passes.book({ token, caller: GUEST, holdId: held.holdId, bookedBy: "Anna" }),
        await passes.release({ token, caller: GUEST, holdId: held.holdId }),
      ]) {
        expect(outcome).toEqual({ ok: false, error: PASS_NOT_VALID });
      }
    }
  });

  test("lookups are rate limited per caller", async () => {
    const { mint, passes } = setup({ lookupLimit: 2 });
    const { token } = mint();
    must(await passes.findTimes({ token, caller: GUEST }));
    must(await passes.findTimes({ token, caller: GUEST }));
    const limited = await passes.findTimes({ token, caller: GUEST });
    expect(limited.ok).toBe(false);
    if (limited.ok) return;
    expect(limited.error).toContain("Too many");
    expect(limited.error).not.toContain(token);
    expect((await passes.findTimes({ token, caller: STRANGER })).ok).toBe(true);
  });
});

describe("telling the owner", () => {
  test("a booking with a pass tells the owner once; holds, refusals, failed commits and revokes tell nothing", async () => {
    const { mint, passes, notices, state } = setup();
    const { token, pass } = mint({ uses: 2, label: "for Gina" });
    must(await passes.findTimes({ token, caller: GUEST }));
    await passes.hold({ token, caller: GUEST, start: T, lengthMinutes: 45 }); // refused
    const held = must(await passes.hold({ token, caller: GUEST, start: T }));
    state.commitFails = true;
    expect((await passes.book({ token, caller: GUEST, holdId: held.holdId, bookedBy: "Gina Guest" })).ok).toBe(false);
    state.commitFails = false;
    expect(notices).toEqual([]);

    const again = must(await passes.hold({ token, caller: GUEST, start: T }));
    must(await passes.book({ token, caller: GUEST, holdId: again.holdId, bookedBy: "Gina Guest", note: "Intro call" }));
    expect(notices).toEqual([
      {
        kind: "pass_booking",
        calendarId: "cal1",
        passId: pass.id,
        text: `Gina Guest booked Sun 6 Jan, 11:00 to 11:30 (Europe/Berlin) on Simon's week with the pass "for Gina" (note: Intro call)`,
      },
    ]);
    expect(JSON.stringify(notices)).not.toContain(token.slice(4));

    const other = mint();
    must(await passes.hold({ token: other.token, caller: GUEST, start: T + 60 * MIN }));
    must(await passes.revoke({ owner: OWNER, passId: other.pass.id }));
    must(await passes.revoke({ owner: OWNER, passId: pass.id }));
    expect(notices).toHaveLength(1);
  });

  test("a pass without a label or note reads plainly", async () => {
    const { mint, passes, notices } = setup();
    const { token } = mint();
    const held = must(await passes.hold({ token, caller: GUEST, start: T }));
    must(await passes.book({ token, caller: GUEST, holdId: held.holdId, bookedBy: "Gina Guest" }));
    expect(notices[0]?.text).toBe("Gina Guest booked Sun 6 Jan, 11:00 to 11:30 (Europe/Berlin) on Simon's week with a booking pass");
  });

  test("a notifier that throws or rejects never fails or undoes the booking", async () => {
    for (const notify of [
      async () => {
        throw new Error("webhook down");
      },
      () => {
        throw new Error("thrown before any promise");
      },
    ]) {
      const { mint, passes, state } = setup({ notify });
      const { token } = mint();
      const held = must(await passes.hold({ token, caller: GUEST, start: T }));
      expect(must(await passes.book({ token, caller: GUEST, holdId: held.holdId, bookedBy: "Gina" })).usesLeft).toBe(0);
      expect(state.bookings).toHaveLength(1);
      expect(state.cancelled).toEqual([]);
    }
  });
});

describe("the record of what happened", () => {
  test("every use is logged with the pass id and the caller, never the pass", async () => {
    const { mint, passes, store, storePath } = setup();
    const { token, pass } = mint();
    await passes.findTimes({ token, caller: GUEST });
    await passes.hold({ token, caller: GUEST, start: T, lengthMinutes: 45 }); // refused: length
    const held = must(await passes.hold({ token, caller: GUEST, start: T }));
    must(await passes.book({ token, caller: GUEST, holdId: held.holdId, bookedBy: "Anna" }));
    await passes.findTimes({ token, caller: STRANGER }); // refused: spent

    const audit = store.get(pass.id)?.audit ?? [];
    expect(audit.map((u) => [u.action, u.principal])).toEqual([
      ["find", GUEST],
      ["refused", GUEST],
      ["hold", GUEST],
      ["book", GUEST],
      ["refused", STRANGER],
    ]);
    expect(audit.every((u) => u.at === NOW)).toBe(true);
    expect(readFileSync(storePath, "utf-8")).not.toContain(token);
  });

  test("the store keeps passes across a reopen and drops a hand-edited one that fails its shape check", () => {
    const path = tmpPath("pass-store");
    const store = openBookingPassStore(path, { now: () => 1_000 });
    const input = { tokenHash: sha256("x"), calendarId: "c", createdBy: OWNER, label: null, from: 10, to: 20, lengthsMinutes: [30], uses: 1, expiresAt: 5_000 };
    const pass = store.create(input);
    expect(openBookingPassStore(path).findByTokenHash(sha256("x"))?.id).toBe(pass.id);
    expect(() => store.create(input)).toThrow(); // one pass per hash

    const good = JSON.parse(readFileSync(path, "utf-8")).passes[0];
    writeFileSync(path, JSON.stringify({ version: 1, passes: [good, { ...good, id: "b", tokenHash: "plain" }, { ...good, id: "c", state: { status: "active" } }] }));
    expect(openBookingPassStore(path).count()).toBe(1);
  });

  test("spending is a compare-and-set: only an active pass can start, and a refusal puts it back", () => {
    const store = openBookingPassStore(tmpPath("pass-cas"));
    const pass = store.create({ tokenHash: sha256("y"), calendarId: "c", createdBy: OWNER, label: null, from: 10, to: 20, lengthsMinutes: [30], uses: 1, expiresAt: 5_000 });
    store.addHold(pass.id, { holdId: "h1", start: 10, end: 15, expiresAt: 100, placedBy: GUEST });
    expect(store.beginSpend(pass.id)?.state.status).toBe("spending");
    expect(store.beginSpend(pass.id)).toBeUndefined();
    expect(store.revoke(pass.id, 1)).toBeUndefined();
    expect(store.finishSpend(pass.id, { booked: false, holdId: "h1", at: 2 })?.state).toEqual({ status: "active", usesLeft: 1 });
    expect(store.beginSpend(pass.id)?.state.status).toBe("spending");
  });
});
