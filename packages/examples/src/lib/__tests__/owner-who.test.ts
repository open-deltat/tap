import { expect, test } from "bun:test";
import { getOwnedCalendar } from "../owned-calendar-service";
import { commitHold } from "../bookable-service";
import { MIN, NOW, OWNER, T, setupMeetings } from "./meeting-fixtures";

// The owner's calendar read joins the kernel's bookings (time) with booking-details (the person).

test("a booking shows its booker from booking-details; an old one with a name label reads it as legacy", async () => {
  const { dt, registry, details, state } = setupMeetings({ mode: "instant" });
  const hold = await dt.holds.place({ resourceId: "cal1", start: T, end: T + 30 * MIN, expiresAt: T });
  const booked = await commitHold({ dt, registry, details }, "cal1", hold.id, "Wendy Web", "wendy@example.com");
  if (!booked.ok) throw new Error(booked.error);
  // Booked before names left the kernel: the fixture's seeded bookings carry the label "Seeded".
  state.seededBookings.push({ id: "old1", resourceId: "cal1", start: T + 60 * MIN, end: T + 90 * MIN });

  const read = await getOwnedCalendar({ dt, registry, details }, { id: "cal1", owner: OWNER });
  if (!read.ok) throw new Error(read.error);
  expect(read.value.bookings.map((b) => [b.id, b.who])).toEqual([
    [booked.value.bookingId, { name: "Wendy Web", email: "wendy@example.com", note: null, legacy: false }],
    ["old1", { name: "Seeded", email: null, note: null, legacy: true }],
  ]);
});

test("a details row whose booking the kernel does not have is never shown", async () => {
  const { dt, registry, details } = setupMeetings();
  await details.put({ bookingId: "ghost", calendarId: "cal1", name: "Nobody Here", email: null, note: null, source: "web", createdAt: NOW });
  const read = await getOwnedCalendar({ dt, registry, details }, { id: "cal1", owner: OWNER });
  if (!read.ok) throw new Error(read.error);
  expect(JSON.stringify(read.value)).not.toContain("Nobody Here");
});
