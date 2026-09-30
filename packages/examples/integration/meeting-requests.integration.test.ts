/**
 * Live-server suite for meeting requests: `lib/meeting-request-service` against a real deltat.
 *
 * The unit tests fake the kernel. What only a real one can show: that a request is checked against
 * the calendar's real open hours, that approving books under the requester's name, that a booked
 * time is no longer free to ask for, and that approving a time someone took meanwhile books nothing.
 *
 * Gated on DELTAT_INTEGRATION_PORT like the other live suites. Run locally:
 *   DELTAT_INTEGRATION_PORT=5445 DELTAT_INTEGRATION_PASSWORD=verify \
 *     bun test packages/examples/integration/
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { DeltaT } from "@open-deltat/client";
import { openBookableRegistry } from "../src/lib/public-bookables";
import { openMeetingRequestStore, type RequestContact } from "../src/lib/meeting-requests";
import { createMeetingService } from "../src/lib/meeting-request-service";
import { createOwnedCalendar, saveAvailability } from "../src/lib/owned-calendar-service";
import { silentNotifier } from "../src/lib/notify";

const PORT_ENV = process.env.DELTAT_INTEGRATION_PORT;
const enabled = PORT_ENV !== undefined && PORT_ENV !== "";
const liveTest = enabled ? test : test.skip;

const MIN = 60_000;
const OWNER = "https://issuer.test#owner";
const ANNA = "https://issuer.test#anna";
const anna: RequestContact = { name: "Anna Example", email: "anna@example.com", emailVerified: true };

const scratchDir = enabled ? mkdtempSync(join(tmpdir(), "tap-meetings-it-")) : "";
const dt = enabled
  ? new DeltaT({
      host: process.env.DELTAT_INTEGRATION_HOST ?? "127.0.0.1",
      port: Number(PORT_ENV),
      // A fresh tenant per run; deltat strips the dashes when it sanitizes a tenant name.
      database: `meet${randomUUID().replace(/-/g, "")}`,
      password: process.env.DELTAT_INTEGRATION_PASSWORD ?? "deltat",
    })
  : null;

afterAll(async () => {
  await dt?.close();
  if (scratchDir) rmSync(scratchDir, { recursive: true, force: true });
});

/** A calendar open every day, 09:00 to 17:00 in UTC, whose owner approves each meeting. */
async function requestCalendar(client: DeltaT) {
  const registry = openBookableRegistry(join(scratchDir, `registry-${randomUUID()}.json`));
  const made = await createOwnedCalendar({ dt: client, registry }, { name: "Office hours", timezone: "UTC", owner: OWNER });
  if (!made.ok) throw new Error(made.error);
  const day = [{ start: "09:00", end: "17:00" }];
  const week = { 0: day, 1: day, 2: day, 3: day, 4: day, 5: day, 6: day };
  const saved = await saveAvailability({ dt: client, registry }, { id: made.value.id, owner: OWNER, week, slotMinutes: 30, priceCents: null });
  if (!saved.ok) throw new Error(saved.error);
  registry.updateOwned(made.value.id, OWNER, { bookingMode: "request" });
  const service = createMeetingService({
    dt: client,
    registry,
    store: openMeetingRequestStore(join(scratchDir, `requests-${randomUUID()}.json`)),
    notify: silentNotifier,
  });
  // Tomorrow 10:00 UTC: inside the open hours, in the future, within the horizon.
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const t = Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), 10);
  return { id: made.value.id, service, t };
}

describe("meeting requests against a live deltat", () => {
  liveTest("a request outside the open hours is refused; inside them it waits, holding nothing", async () => {
    if (!dt) throw new Error("live suite without a client");
    const { id, service, t } = await requestCalendar(dt);
    const night = t + 12 * 60 * MIN; // 22:00, after closing
    expect((await service.request({ calendarId: id, requester: ANNA, contact: anna, start: night, end: night + 30 * MIN })).ok).toBe(false);

    const asked = await service.request({ calendarId: id, requester: ANNA, contact: anna, start: t, end: t + 30 * MIN });
    expect(asked.ok).toBe(true);
    expect(await dt.holds.get(id)).toEqual([]);
  });

  liveTest("approving books it under the requester's name, and the time is then no longer free to ask for", async () => {
    if (!dt) throw new Error("live suite without a client");
    const { id, service, t } = await requestCalendar(dt);
    const asked = await service.request({ calendarId: id, requester: ANNA, contact: anna, start: t, end: t + 30 * MIN });
    if (!asked.ok) throw new Error(asked.error);

    const approved = await service.approve({ requestId: asked.value.id, owner: OWNER });
    expect(approved).toMatchObject({ ok: true, value: { decision: { status: "approved" } } });
    expect(await dt.bookings.get(id)).toEqual([expect.objectContaining({ start: t, end: t + 30 * MIN, label: "Anna Example" })]);

    const again = await service.request({ calendarId: id, requester: "https://issuer.test#ben", contact: anna, start: t, end: t + 30 * MIN });
    expect(again).toEqual({ ok: false, error: "That time is not free. Pick another." });
  });

  liveTest("approving a time someone took meanwhile books nothing and marks the request unavailable", async () => {
    if (!dt) throw new Error("live suite without a client");
    const { id, service, t } = await requestCalendar(dt);
    const asked = await service.request({ calendarId: id, requester: ANNA, contact: anna, start: t, end: t + 30 * MIN });
    if (!asked.ok) throw new Error(asked.error);

    // Someone else holds the same half hour directly in deltat before the owner gets to it.
    await dt.holds.place({ resourceId: id, start: t, end: t + 30 * MIN, expiresAt: Date.now() + 5 * MIN });

    const approved = await service.approve({ requestId: asked.value.id, owner: OWNER });
    expect(approved.ok).toBe(false);
    expect(service.forOwner({ calendarId: id, owner: OWNER })).toMatchObject({ ok: true, value: [{ decision: { status: "unavailable" } }] });
    expect(await dt.bookings.get(id)).toEqual([]);
  });
});
