import { test, expect } from "bun:test";
import { getOwnedCalendar } from "../owned-calendar-service";
import { ANNA, MIN, OWNER, T, setupMeetings } from "./meeting-fixtures";

// The owner's dashboard showed live holds from kernel payloads on the socket. The socket now says
// only "changed", so the owner's own read has to carry the holds, and it must not carry their ids:
// a hold id is what release and commit accept as authority, and no browser needs it.

test("the owner's read shows each active hold's span and expiry, never its id", async () => {
  const { dt, registry } = setupMeetings();
  const placed = await dt.holds.place({ resourceId: "cal1", start: T, end: T + 30 * MIN, expiresAt: T });
  const read = await getOwnedCalendar({ dt, registry }, { id: "cal1", owner: OWNER });
  if (!read.ok) throw new Error(read.error);
  expect(read.value.holds).toEqual([{ start: T, end: T + 30 * MIN, expiresAt: T }]);
  expect(JSON.stringify(read.value)).not.toContain(placed.id);
});

test("someone else's read gets nothing", async () => {
  const { dt, registry } = setupMeetings();
  await dt.holds.place({ resourceId: "cal1", start: T, end: T + 30 * MIN, expiresAt: T });
  expect(await getOwnedCalendar({ dt, registry }, { id: "cal1", owner: ANNA })).toEqual({
    ok: false,
    error: "You do not own this calendar.",
  });
});
