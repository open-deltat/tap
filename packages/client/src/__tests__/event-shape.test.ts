import { describe, expect, test } from "bun:test";
import { asDeltaTEvent } from "../event-shape.js";

// A notification is untrusted until its shape is checked: the watch dereferences its fields at once.

const span = { start: 1000, end: 2000 };

describe("asDeltaTEvent", () => {
  test("accepts every event deltat sends, old and new fields alike", () => {
    for (const event of [
      { ResourceCreated: { id: "r", parent_id: null, name: null, capacity: 1, buffer_after: null } },
      { ResourceUpdated: { id: "r", name: null, capacity: null, buffer_after: 60 } },
      { ResourceDeleted: { id: "r" } },
      { RuleAdded: { id: "u", resource_id: "r", span, blocking: false } },
      { RuleRemoved: { id: "u", resource_id: "r" } },
      { HoldPlaced: { id: "h", resource_id: "r", span, expires_at: 5000 } },
      { HoldReleased: { id: "h", resource_id: "r" } },
      { HoldReleased: { id: "h", resource_id: "r", span, reason: "committed", booking_id: "b" } },
      { BookingConfirmed: { id: "b", resource_id: "r", span, label: null } },
      { BookingCancelled: { id: "b", resource_id: "r", span } },
      { Lagged: { missed: 3 } },
    ]) {
      expect(asDeltaTEvent(event)).toEqual(event);
    }
  });

  test("refuses anything that only looks like an event", () => {
    for (const payload of [
      "x",
      42,
      null,
      [],
      {},
      { Lagged: {} },
      { Lagged: { missed: -1 } },
      { Lagged: { missed: "7" } },
      { ResourceDeleted: {} },
      { HoldPlaced: { id: "h", resource_id: "r", span: { start: "a", end: 2 }, expires_at: 1 } },
      { HoldReleased: { id: "h", resource_id: "r", reason: "vanished" } },
      { BookingConfirmed: { id: "b", resource_id: "r", span } }, // label missing
      { HoldPlaced: { id: "h" }, Lagged: { missed: 1 } }, // two kinds at once
      { SomethingNew: { id: "x" } },
    ]) {
      expect(asDeltaTEvent(payload)).toBeNull();
    }
  });

  test("refuses a kind named after a prototype member, without throwing", () => {
    for (const kind of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
      expect(asDeltaTEvent(JSON.parse(`{"${kind}":{}}`))).toBeNull();
    }
  });
});
