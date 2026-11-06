import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { openBookableRegistry } from "../public-bookables";
import { openMeetingRequestStore } from "../meeting-requests";
import { effectiveStatus, MAX_PENDING_PER_CALENDAR } from "../meeting-request-service";
import { commitHold, holdSlot, REQUESTS_ONLY } from "../bookable-service";
import { ANNA, BEN, MIN, NOW, OWNER, T, annaContact, setupMeetings as setup, tmpPath } from "./meeting-fixtures";

describe("the request store", () => {
  test("keeps requests across a reopen, newest first, and decides each one once", () => {
    const path = tmpPath("store");
    const times = { now: 1_000 };
    const store = openMeetingRequestStore(path, { now: () => times.now });
    const first = store.create({ calendarId: "c", requester: ANNA, contact: annaContact, start: 10, end: 20, note: null });
    times.now = 2_000;
    const second = store.create({ calendarId: "c", requester: BEN, contact: annaContact, start: 30, end: 40, note: "hi" });

    const reopened = openMeetingRequestStore(path);
    expect(reopened.listForCalendar("c").map((r) => r.id)).toEqual([second.id, first.id]);
    expect(reopened.listForRequester(ANNA).map((r) => r.id)).toEqual([first.id]);

    expect(reopened.decide(first.id, { status: "declined", decidedAt: 3, reason: null })?.decision.status).toBe("declined");
    expect(reopened.decide(first.id, { status: "approved", decidedAt: 4, bookingId: "b" })).toBeUndefined();
    expect(openMeetingRequestStore(path).get(first.id)?.decision.status).toBe("declined");
  });

  test("drops a hand-edited record that fails its shape check instead of trusting it", () => {
    const path = tmpPath("malformed");
    const good = { id: "a", calendarId: "c", requester: ANNA, contact: annaContact, start: 1, end: 2, note: null, createdAt: 1, decision: { status: "pending" } };
    writeFileSync(path, JSON.stringify({ version: 1, requests: [good, { ...good, id: "b", end: 0 }, { ...good, id: "c", decision: { status: "approved" } }] }));
    expect(openMeetingRequestStore(path).count()).toBe(1);
  });

  test("an unconfirmed decision is kept across a reopen, so it cannot quietly become approvable again", () => {
    const path = tmpPath("unconfirmed");
    const store = openMeetingRequestStore(path);
    const request = store.create({ calendarId: "c", requester: ANNA, contact: annaContact, start: 10, end: 20, note: null });
    expect(store.decide(request.id, { status: "unconfirmed", decidedAt: 5 })?.decision.status).toBe("unconfirmed");
    expect(openMeetingRequestStore(path).get(request.id)?.decision).toEqual({ status: "unconfirmed", decidedAt: 5 });
  });

  test("refuses past its ceiling rather than filling the disk", () => {
    const store = openMeetingRequestStore(tmpPath("full"), { maxEntries: 1 });
    store.create({ calendarId: "c", requester: ANNA, contact: annaContact, start: 1, end: 2, note: null });
    expect(() => store.create({ calendarId: "c", requester: ANNA, contact: annaContact, start: 3, end: 4, note: null })).toThrow();
  });
});

describe("asking for a meeting", () => {
  test("stores the request, holds nothing, and tells the owner who asked and when", async () => {
    const { ask, state, notices } = setup({ reviewBase: "https://delt.at" });
    const result = await ask({ note: "Coffee about deltat?" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.decision.status).toBe("pending");
    expect(state.holds).toEqual([]); // asking is information, never a hold
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: "meeting_request", calendarId: "cal1", requestId: result.value.id });
    expect(notices[0]?.text).toContain("Anna Example <anna@example.com>");
    expect(notices[0]?.text).toContain("Sun 6 Jan, 11:00 to 11:30 (Europe/Berlin)");
    expect(notices[0]?.text).toContain("Note: Coffee about deltat?");
    expect(notices[0]?.text).toContain("Review: https://delt.at/dashboard/c/cal1");
  });

  test("marks an email the provider did not verify", async () => {
    const { ask, notices } = setup();
    await ask({ contact: { ...annaContact, emailVerified: false } });
    expect(notices[0]?.text).toContain("(email unverified)");
  });

  test("a calendar that books directly does not take requests", async () => {
    const { ask } = setup({ mode: "instant" });
    const result = await ask();
    expect(result).toMatchObject({ ok: false });
  });

  test("refuses spans that are not whole slots, too long, past, or beyond the horizon", async () => {
    const { ask } = setup();
    for (const [start, end] of [
      [T, T + 20 * MIN],
      [T, T + 150 * MIN],
      [NOW - 30 * MIN, NOW],
      [NOW + 90 * 24 * 60 * MIN, NOW + 90 * 24 * 60 * MIN + 30 * MIN],
    ] as const) {
      expect((await ask({ start, end })).ok).toBe(false);
    }
    expect((await ask({ start: T, end: T + 120 * MIN })).ok).toBe(true); // four slots is the ceiling
  });

  test("refuses a time that is not free", async () => {
    const { ask, state } = setup();
    state.free = [{ start: T + 60 * MIN, end: T + 180 * MIN }];
    expect(await ask()).toMatchObject({ ok: false, error: "That time is not free. Pick another." });
  });

  test("asking again for the same time returns the request already waiting (agents retry)", async () => {
    const { ask, notices } = setup();
    const first = await ask();
    const again = await ask();
    expect(first.ok && again.ok && again.value.id === first.value.id).toBe(true);
    expect(notices).toHaveLength(1);
  });

  test(`caps what one person may have waiting at ${MAX_PENDING_PER_CALENDAR} per calendar`, async () => {
    const { ask } = setup();
    for (let i = 0; i < MAX_PENDING_PER_CALENDAR; i++) {
      expect((await ask({ start: T + i * 60 * MIN, end: T + i * 60 * MIN + 30 * MIN })).ok).toBe(true);
    }
    const over = await ask({ start: T + 10 * 60 * MIN, end: T + 10 * 60 * MIN + 30 * MIN });
    expect(over.ok).toBe(false);
    // Someone else is not affected.
    expect((await ask({ requester: BEN, start: T + 10 * 60 * MIN, end: T + 10 * 60 * MIN + 30 * MIN })).ok).toBe(true);
  });

  test("a name made of control characters is refused, not stored", async () => {
    const { ask } = setup();
    expect((await ask({ contact: { ...annaContact, name: "\u0000‮" } })).ok).toBe(false);
  });
});

describe("the owner's answer", () => {
  test("approving holds and books the time under the requester's name", async () => {
    const { ask, service, state } = setup();
    const asked = await ask();
    if (!asked.ok) throw new Error(asked.error);
    const approved = await service.approve({ requestId: asked.value.id, owner: OWNER });
    expect(approved).toMatchObject({ ok: true, value: { decision: { status: "approved", bookingId: "booking1" } } });
    expect(state.bookings).toEqual([{ id: "booking1", label: "Anna Example" }]);
    expect((await service.approve({ requestId: asked.value.id, owner: OWNER })).ok).toBe(false);
  });

  test("only the calendar's owner can approve or decline, and a stranger learns nothing", async () => {
    const { ask, service, state } = setup();
    const asked = await ask();
    if (!asked.ok) throw new Error(asked.error);
    const notOwner = await service.approve({ requestId: asked.value.id, owner: ANNA });
    const unknown = await service.approve({ requestId: "nope", owner: OWNER });
    expect(notOwner).toEqual({ ok: false, error: "No such request on a calendar you own." });
    expect(unknown).toEqual(notOwner);
    expect(service.decline({ requestId: asked.value.id, owner: BEN })).toEqual(notOwner);
    expect(state.holds).toEqual([]);
  });

  test("approving a time someone took meanwhile books nothing and marks the request unavailable", async () => {
    const { ask, service, state, store } = setup();
    const asked = await ask();
    if (!asked.ok) throw new Error(asked.error);
    state.holdFails = true;
    const approved = await service.approve({ requestId: asked.value.id, owner: OWNER });
    expect(approved.ok).toBe(false);
    expect(store.get(asked.value.id)?.decision.status).toBe("unavailable");
    expect(state.bookings).toEqual([]);
  });

  test("a commit the kernel refuses (the hold is gone) books nothing and leaves the request pending to try again", async () => {
    const { ask, service, state, store } = setup();
    const asked = await ask();
    if (!asked.ok) throw new Error(asked.error);
    state.commitFails = true;
    expect((await service.approve({ requestId: asked.value.id, owner: OWNER })).ok).toBe(false);
    expect(state.bookings).toEqual([]);
    expect(store.get(asked.value.id)?.decision.status).toBe("pending");
  });

  test("an approval whose commit landed but whose reply was lost is recorded as approved, so approving again books nothing", async () => {
    const { ask, service, state, store } = setup();
    const asked = await ask();
    if (!asked.ok) throw new Error(asked.error);
    state.commitReplyLost = true;
    expect(await service.approve({ requestId: asked.value.id, owner: OWNER })).toMatchObject({ ok: true, value: { decision: { status: "approved", bookingId: "booking1" } } });
    state.commitReplyLost = false;
    expect((await service.approve({ requestId: asked.value.id, owner: OWNER })).ok).toBe(false);
    expect(state.bookings).toHaveLength(1);
    expect(store.get(asked.value.id)?.decision.status).toBe("approved");
  });

  test("a commit that lands late, after the error reached us, is found because the hold is released before reading", async () => {
    const { ask, service, state } = setup();
    const asked = await ask();
    if (!asked.ok) throw new Error(asked.error);
    state.commitLandsLate = true;
    expect(await service.approve({ requestId: asked.value.id, owner: OWNER })).toMatchObject({ ok: true, value: { decision: { status: "approved" } } });
    state.commitLandsLate = false;
    expect((await service.approve({ requestId: asked.value.id, owner: OWNER })).ok).toBe(false);
    expect(state.bookings).toHaveLength(1);
  });

  test("a commit that never reached the kernel gives the hold back once and leaves the request pending", async () => {
    const { ask, service, state, store } = setup();
    const asked = await ask();
    if (!asked.ok) throw new Error(asked.error);
    state.commitNotSent = true;
    expect(await service.approve({ requestId: asked.value.id, owner: OWNER })).toEqual({ ok: false, error: "Booking it failed. The request is still pending; try again." });
    expect(state.released).toEqual(["hold1"]);
    expect(store.get(asked.value.id)?.decision.status).toBe("pending");
  });

  test("after an unclear commit, a release that finds the hold already gone lets the bookings decide", async () => {
    const { ask, service, state } = setup();
    const asked = await ask();
    if (!asked.ok) throw new Error(asked.error);
    state.commitReplyLost = true;
    state.releaseFails = "gone";
    expect(await service.approve({ requestId: asked.value.id, owner: OWNER })).toMatchObject({ ok: true, value: { decision: { status: "approved" } } });
  });

  test("a connection error whose text says 'expired' is not taken for the kernel's refusal", async () => {
    const { ask, service, state, dt } = setup();
    const asked = await ask();
    if (!asked.ok) throw new Error(asked.error);
    const holds = dt.holds as unknown as { commit: (id: string, o?: { label?: string }) => Promise<{ bookingId: string }> };
    const real = holds.commit.bind(holds);
    holds.commit = async (id, o) => {
      await real(id, o); // the kernel applied it
      throw Object.assign(new Error("socket expired while reading the reply"), { code: "ECONNRESET" });
    };
    expect(await service.approve({ requestId: asked.value.id, owner: OWNER })).toMatchObject({ ok: true, value: { decision: { status: "approved" } } });
    expect(state.bookings).toHaveLength(1);
  });

  for (const [what, fail] of [
    ["the release", (s: ReturnType<typeof setup>["state"]) => (s.releaseFails = "reset")],
    ["the read", (s: ReturnType<typeof setup>["state"]) => (s.readsFail = true)],
  ] as const) {
    test(`when ${what} after an unclear commit fails, the request shows as unconfirmed and cannot be approved again`, async () => {
      const { ask, service, state, store } = setup();
      const asked = await ask();
      if (!asked.ok) throw new Error(asked.error);
      state.commitReplyLost = true;
      fail(state);
      const approved = await service.approve({ requestId: asked.value.id, owner: OWNER });
      expect(approved.ok).toBe(false);
      if (approved.ok) return;
      expect(approved.error).toContain("could not confirm");
      state.commitReplyLost = false;
      state.releaseFails = null;
      state.readsFail = false;

      expect(store.get(asked.value.id)?.decision.status).toBe("unconfirmed");
      expect(await service.approve({ requestId: asked.value.id, owner: OWNER })).toEqual({ ok: false, error: "That request is already unconfirmed." });
      expect(service.decline({ requestId: asked.value.id, owner: OWNER }).ok).toBe(false);
      expect(service.withdraw({ requestId: asked.value.id, requester: ANNA }).ok).toBe(false);
      expect(state.bookings).toHaveLength(1); // the one booking that may have landed, never a second
    });
  }

  test("a double-clicked approve books once and never also marks the request unavailable", async () => {
    const { ask, service, state, store } = setup();
    const asked = await ask();
    if (!asked.ok) throw new Error(asked.error);
    state.latencyMs = 20;
    const [a, b] = await Promise.all([
      service.approve({ requestId: asked.value.id, owner: OWNER }),
      service.approve({ requestId: asked.value.id, owner: OWNER }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(state.bookings).toHaveLength(1);
    expect(store.get(asked.value.id)?.decision.status).toBe("approved");
  });

  test("declining records the reason; the requester can withdraw their own request and nobody else's", async () => {
    const { ask, service } = setup();
    const one = await ask();
    const two = await ask({ start: T + 60 * MIN, end: T + 90 * MIN });
    if (!one.ok || !two.ok) throw new Error("setup");
    expect(service.decline({ requestId: one.value.id, owner: OWNER, reason: "Travelling that week" })).toMatchObject({
      ok: true,
      value: { decision: { status: "declined", reason: "Travelling that week" } },
    });
    expect(service.withdraw({ requestId: two.value.id, requester: BEN })).toEqual({ ok: false, error: "No such request of yours." });
    expect(service.withdraw({ requestId: two.value.id, requester: ANNA })).toMatchObject({ ok: true, value: { decision: { status: "withdrawn" } } });
    expect(service.mine(ANNA).map((r) => r.decision.status).sort()).toEqual(["declined", "withdrawn"]);
  });

  test("a request still waiting when its time comes is expired and can no longer be approved", async () => {
    const { ask, service, clock, store } = setup();
    const asked = await ask();
    if (!asked.ok) throw new Error(asked.error);
    clock.now = T + MIN;
    const request = store.get(asked.value.id);
    expect(request && effectiveStatus(request, clock.now)).toBe("expired");
    expect(await service.approve({ requestId: asked.value.id, owner: OWNER })).toEqual({ ok: false, error: "That request is already expired." });
  });

  test("the owner's inbox lists the calendar's requests; nobody else can read it", async () => {
    const { ask, service } = setup();
    await ask();
    expect(service.forOwner({ calendarId: "cal1", owner: OWNER })).toMatchObject({ ok: true, value: [{ requester: ANNA }] });
    expect(service.forOwner({ calendarId: "cal1", owner: ANNA })).toEqual({ ok: false, error: "You do not own this calendar." });
  });
});

describe("a calendar that takes requests", () => {
  test("refuses a direct hold or commit on every path, so nothing books around the owner", async () => {
    const { registry, dt } = setup();
    expect(await holdSlot({ dt, registry }, "cal1", T, T + 30 * MIN)).toEqual({ ok: false, error: REQUESTS_ONLY });
    expect(await commitHold({ dt, registry }, "cal1", "hold1", "Anna")).toEqual({ ok: false, error: REQUESTS_ONLY });
  });

  test("an older registry file without the field loads as instant booking", () => {
    const path = tmpPath("legacy-registry");
    writeFileSync(
      path,
      JSON.stringify({ version: 1, records: [{ id: "x", name: "Old", slotMinutes: 30, timezone: "UTC", createdAt: 1, keyHash: "h" }] })
    );
    expect(openBookableRegistry(path).get("x")?.bookingMode).toBe("instant");
    expect(readFileSync(path, "utf-8")).not.toContain("bookingMode");
  });
});
