import { describe, expect, test } from "bun:test";
import { isOpaqueRef, openBookingDetailsStore, opaqueRef, whoBooked, type BookingDetails } from "../booking-details";
import { tmpPath } from "./meeting-fixtures";

// deltat holds time only. Who booked (name, email, note) is app data keyed by the kernel booking id,
// so it can be read, shown to the owner, and erased without touching the WAL.

const HOUR = 3_600_000;
const NOW = Date.UTC(2036, 0, 5, 8);

const row = (over: Partial<BookingDetails> = {}): BookingDetails => ({
  bookingId: "b1",
  calendarId: "cal1",
  name: "Anna Example",
  email: "anna@example.com",
  note: null,
  source: "web",
  createdAt: NOW,
  ...over,
});

describe("the booking-details store", () => {
  test("a row is kept by booking id, survives a reopen, and lists per calendar", async () => {
    const path = tmpPath(`details_${crypto.randomUUID()}`);
    const store = openBookingDetailsStore(path, { now: () => NOW });
    await store.put(row());
    await store.put(row({ bookingId: "b2", calendarId: "cal2", name: "Ben" }));
    const reopened = openBookingDetailsStore(path, { now: () => NOW });
    expect(await reopened.get("b1")).toEqual(row());
    expect((await reopened.forCalendar("cal1")).map((d) => d.bookingId)).toEqual(["b1"]);
  });

  test("erase removes every row for a booking id, or for an email, and says how many", async () => {
    const store = openBookingDetailsStore(tmpPath(`details_${crypto.randomUUID()}`), { now: () => NOW });
    await store.put(row({ bookingId: "b1", email: "Anna@Example.com" }));
    await store.put(row({ bookingId: "b2", email: "anna@example.com" }));
    await store.put(row({ bookingId: "b3", email: "ben@example.com" }));
    expect(await store.erase({ email: "anna@example.com" })).toBe(2);
    expect(await store.erase({ bookingId: "b3" })).toBe(1);
    expect(await store.forCalendar("cal1")).toEqual([]);
  });

  test("the sweep drops rows whose booking the kernel no longer has, once they are past the grace period", async () => {
    const clock = { now: NOW };
    const store = openBookingDetailsStore(tmpPath(`details_${crypto.randomUUID()}`), { now: () => clock.now });
    await store.put(row({ bookingId: "gone", createdAt: NOW - 2 * HOUR }));
    await store.put(row({ bookingId: "live", createdAt: NOW - 2 * HOUR }));
    // Written a moment ago: its booking may be newer than the kernel read the sweep is using.
    await store.put(row({ bookingId: "fresh", createdAt: NOW }));
    const removed = await store.sweep(async (calendarId) => (calendarId === "cal1" ? new Set(["live"]) : null));
    expect(removed).toBe(1);
    expect((await store.forCalendar("cal1")).map((d) => d.bookingId).sort()).toEqual(["fresh", "live"]);
  });

  test("a calendar the sweep cannot read keeps its rows", async () => {
    const store = openBookingDetailsStore(tmpPath(`details_${crypto.randomUUID()}`), { now: () => NOW });
    await store.put(row({ createdAt: NOW - 2 * HOUR }));
    expect(await store.sweep(async () => null)).toBe(0);
    expect(await store.get("b1")).toBeDefined();
  });
});

describe("who booked, as the owner reads it", () => {
  const booking = (label: string | null) => ({ id: "b1", label });

  test("the details row wins", () => {
    expect(whoBooked(booking(opaqueRef()), row())).toEqual({ name: "Anna Example", email: "anna@example.com", note: null, legacy: false });
  });

  test("an old booking with only a name in its label is read as a legacy name", () => {
    expect(whoBooked(booking("Dana R."), undefined)).toEqual({ name: "Dana R.", email: null, note: null, legacy: true });
  });

  test("an opaque label is never shown as a name, and no label is nobody", () => {
    expect(whoBooked(booking(opaqueRef()), undefined)).toBeNull();
    expect(whoBooked(booking(null), undefined)).toBeNull();
  });

  test("opaque labels carry nothing about a person and differ every time", () => {
    const a = opaqueRef();
    expect(isOpaqueRef(a)).toBe(true);
    expect(isOpaqueRef("Anna Example")).toBe(false);
    expect(opaqueRef()).not.toBe(a);
  });
});
