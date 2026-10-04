/**
 * Live-server suite for kits through the MCP tools: several calendars found, held and booked
 * together against a real deltat (0.4.0 or later), driven through a real MCP client.
 *
 * The unit tests stub the SDK, so they can only assume what deltat accepts. This pins the one
 * promise a refused kit makes: every alternative it offers is a time hold_slot then accepts, the
 * same guarantee deltat's own counter-offers carry for a single calendar.
 *
 * Gated on DELTAT_INTEGRATION_PORT like the other live suites.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { DeltaT } from "@open-deltat/client";

import { createDeltatMcpServer } from "../src/server.js";

const PORT_ENV = process.env.DELTAT_INTEGRATION_PORT;
const enabled = PORT_ENV !== undefined && PORT_ENV !== "";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2036, 0, 5, 9); // far future: wall-clock now never intersects
const iso = (ms: number) => new Date(ms).toISOString();

const dt = enabled
  ? new DeltaT({
      host: process.env.DELTAT_INTEGRATION_HOST ?? "127.0.0.1",
      port: Number(PORT_ENV),
      // database = tenant in deltat, so a fresh name isolates the whole run.
      database: `it_mcp_${crypto.randomUUID().replaceAll("-", "")}`,
      password: process.env.DELTAT_INTEGRATION_PASSWORD ?? "deltat",
    })
  : null;

afterAll(async () => {
  if (dt !== null) await dt.close();
});

async function connected(sdk: DeltaT): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "kits-it", version: "0.0.0" });
  await Promise.all([createDeltatMcpServer(sdk).connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

/** A calendar open 09:00-17:00 UTC on four consecutive days from T0. */
async function calendar(sdk: DeltaT): Promise<string> {
  const r = await sdk.resources.create({ name: `kit-${crypto.randomUUID()}` });
  await sdk.rules.create([0, 1, 2, 3].map((d) => ({ resourceId: r.id, start: T0 + d * DAY, end: T0 + d * DAY + 8 * HOUR })));
  return r.id;
}

const call = async (client: Client, name: string, args: Record<string, unknown>) => {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { text: string }[];
  return { isError: result.isError === true, body: JSON.parse(content[0].text) };
};

describe.skipIf(!enabled)("kits through the MCP tools", () => {
  test("a refused kit offers only times every calendar is free, and each one can be held", async () => {
    if (dt === null) throw new Error("integration client used while the suite is disabled");
    const client = await connected(dt);
    const body = await calendar(dt);
    const lens = await calendar(dt);
    const wanted = { start: iso(T0 + HOUR), end: iso(T0 + 2 * HOUR) };

    // The lens alone, booked through the same tools as a one-item kit.
    const lensHold = await call(client, "hold_slot", { calendar_ids: [lens], ...wanted });
    expect(lensHold.isError).toBe(false);
    expect((await call(client, "commit_hold", { hold_ids: lensHold.body.hold_ids })).isError).toBe(false);

    const refused = await call(client, "hold_slot", { calendar_ids: [body, lens], ...wanted });
    expect(refused.isError).toBe(true);
    expect(refused.body.error).toBe("CONFLICT");
    expect(refused.body.held).toBe(false);
    expect(refused.body.alternatives.map((a: { start: string }) => a.start)).toEqual([
      iso(T0 + 2 * HOUR),
      iso(T0 + DAY),
      iso(T0 + 2 * DAY),
    ]);
    // Nothing was held on the free calendar by the refused kit.
    expect(await dt.holds.get(body)).toEqual([]);

    for (const alt of refused.body.alternatives as { start: string; end: string }[]) {
      const held = await call(client, "hold_slot", { calendar_ids: [body, lens], start: alt.start, end: alt.end });
      expect(held.isError).toBe(false);
      expect(held.body.hold_ids).toHaveLength(2);
      await call(client, "release_hold", { hold_ids: held.body.hold_ids });
    }
  });

  test("a held kit is booked whole by one commit", async () => {
    if (dt === null) throw new Error("integration client used while the suite is disabled");
    const client = await connected(dt);
    const body = await calendar(dt);
    const lens = await calendar(dt);

    const found = await call(client, "find_slots", { calendar_ids: [body, lens], from: iso(T0), to: iso(T0 + DAY) });
    expect(found.body.slots[0]).toMatchObject({ start: iso(T0), end: iso(T0 + 8 * HOUR) });

    const held = await call(client, "hold_slot", { calendar_ids: [body, lens], start: iso(T0), end: iso(T0 + HOUR) });
    const booked = await call(client, "commit_hold", { hold_ids: held.body.hold_ids, label: "Ana's shoot" });

    expect(booked.body.booking_ids).toHaveLength(2);
    for (const rid of [body, lens]) {
      const bookings = await dt.bookings.get(rid);
      expect(bookings.map((b) => [b.start, b.end, b.label])).toEqual([[T0, T0 + HOUR, "Ana's shoot"]]);
      expect(await dt.holds.get(rid)).toEqual([]);
    }
  });
});
