import { describe, expect, test } from "bun:test";
import { commitHold } from "../bookable-service";
import { isOpaqueRef, type BookingDetailsStore } from "../booking-details";
import { MIN, OWNER, T, setupMeetings } from "./meeting-fixtures";
import { GUEST, setupPasses } from "./pass-fixtures";

// Every path that books a real person's calendar used to write their name into the kernel label.
// deltat holds time only: the label is now an opaque reference and the person goes to booking-details.

const PEOPLE = ["Anna Example", "anna@example.com", "Gina Guest", "Wendy Web", "wendy@example.com"];

function expectNoPersonIn(labels: readonly (string | undefined)[]) {
  expect(labels.length).toBeGreaterThan(0);
  labels.forEach((label) => {
    expect(label === undefined || isOpaqueRef(label)).toBe(true);
    PEOPLE.forEach((p) => expect(label ?? "").not.toContain(p));
  });
}

describe("meeting requests", () => {
  test("approving books an opaque label and writes the requester's name, email and note app-side", async () => {
    const { service, ask, state, details } = setupMeetings();
    const asked = await ask({ note: "About the lease" });
    if (!asked.ok) throw new Error(asked.error);
    const approved = await service.approve({ requestId: asked.value.id, owner: OWNER });
    if (!approved.ok || approved.value.decision.status !== "approved") throw new Error("not approved");
    expectNoPersonIn(state.bookings.map((b) => b.label));
    expect(await details.get(approved.value.decision.bookingId)).toMatchObject({
      calendarId: "cal1",
      name: "Anna Example",
      email: "anna@example.com",
      note: "About the lease",
      source: "meeting_request",
    });
  });
});

describe("booking passes", () => {
  test("booking with a pass books an opaque label and writes the guest's name and note app-side", async () => {
    const { passes, mint, state, details } = setupPasses();
    const { token } = mint();
    const held = await passes.hold({ token, caller: GUEST, start: T });
    if (!held.ok) throw new Error(held.error);
    const booked = await passes.book({ token, caller: GUEST, holdId: held.value.holdId, bookedBy: "Gina Guest", note: "Bring the forms" });
    if (!booked.ok) throw new Error(booked.error);
    expectNoPersonIn(state.bookings.map((b) => b.label));
    expect(await details.get(booked.value.bookingId)).toMatchObject({ name: "Gina Guest", email: null, note: "Bring the forms", source: "pass" });
  });

  test("the owner's pass list still says who booked, read from booking-details", async () => {
    const { passes, mint } = setupPasses();
    const { token, pass } = mint();
    const held = await passes.hold({ token, caller: GUEST, start: T });
    if (!held.ok) throw new Error(held.error);
    await passes.book({ token, caller: GUEST, holdId: held.value.holdId, bookedBy: "Gina Guest" });
    const listed = await passes.list({ owner: OWNER });
    if (!listed.ok) throw new Error(listed.error);
    expect(listed.value.find((p) => p.id === pass.id)?.bookings.map((b) => b.bookedBy)).toEqual(["Gina Guest"]);
  });
});

describe("the public booking page", () => {
  async function webSetup(details?: BookingDetailsStore) {
    const meetings = setupMeetings({ mode: "instant" });
    const hold = await meetings.dt.holds.place({ resourceId: "cal1", start: T, end: T + 30 * MIN, expiresAt: T });
    const deps = { dt: meetings.dt, registry: meetings.registry, details: details ?? meetings.details };
    return { ...meetings, hold, deps };
  }

  test("confirming books an opaque label and writes the name and email app-side", async () => {
    const { deps, hold, state, details } = await webSetup();
    const booked = await commitHold(deps, "cal1", hold.id, "Wendy Web", "wendy@example.com");
    if (!booked.ok) throw new Error(booked.error);
    expectNoPersonIn(state.bookings.map((b) => b.label));
    expect(await details.get(booked.value.bookingId)).toMatchObject({ name: "Wendy Web", email: "wendy@example.com", source: "web" });
  });

  test("the details are written after the kernel booking, and not at all when the kernel refuses", async () => {
    const seenAtPut: boolean[] = [];
    const meetings = setupMeetings({ mode: "instant" });
    const spy: BookingDetailsStore = {
      ...meetings.details,
      put: async (d) => {
        seenAtPut.push(meetings.state.bookings.some((b) => b.id === d.bookingId));
        return meetings.details.put(d);
      },
    };
    const deps = { dt: meetings.dt, registry: meetings.registry, details: spy };
    const first = await meetings.dt.holds.place({ resourceId: "cal1", start: T, end: T + 30 * MIN, expiresAt: T });
    expect((await commitHold(deps, "cal1", first.id, "Wendy Web", null)).ok).toBe(true);
    expect(seenAtPut).toEqual([true]);

    meetings.state.commitFails = true;
    const second = await meetings.dt.holds.place({ resourceId: "cal1", start: T + 60 * MIN, end: T + 90 * MIN, expiresAt: T });
    expect((await commitHold(deps, "cal1", second.id, "Wendy Web", null)).ok).toBe(false);
    expect(seenAtPut).toEqual([true]);
  });

  test("an email that is not one is refused before anything is booked", async () => {
    const { deps, hold, state } = await webSetup();
    expect((await commitHold(deps, "cal1", hold.id, "Wendy Web", "not an email")).ok).toBe(false);
    expect(state.bookings).toEqual([]);
  });
});
