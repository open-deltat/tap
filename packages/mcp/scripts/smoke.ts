/**
 * End-to-end proof of the MCP tool surface against a live local deltat: connect an MCP client to
 * the server over an in-memory transport (no subprocess), then drive the whole loop the way an agent
 * would — create a calendar, set availability, find a slot, hold it, commit it, read it back.
 *
 * Needs a deltat listening (DELTAT_PORT/PASSWORD, defaults match `demo/dev.sh`):
 *   bun packages/mcp/scripts/smoke.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { DeltaT } from "@open-deltat/client";
import { createDeltatMcpServer } from "../src/server.js";

const dt = new DeltaT({
  host: process.env.DELTAT_HOST ?? "localhost",
  port: Number(process.env.DELTAT_PORT ?? 5433),
  database: process.env.DELTAT_DATABASE ?? "public",
  username: process.env.DELTAT_USER ?? "user",
  password: process.env.DELTAT_PASSWORD ?? "secret",
});

const server = createDeltatMcpServer(dt);
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "smoke", version: "0.0.0" });

const text = (r: { content: Array<{ type: string; text?: string }>; isError?: boolean }) => {
  const body = r.content.map((c) => c.text ?? "").join("");
  if (r.isError) throw new Error(`tool error: ${body}`);
  return JSON.parse(body);
};
const call = async (name: string, args: Record<string, unknown>) =>
  text((await client.callTool({ name, arguments: args })) as never);

async function main() {
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const tools = (await client.listTools()).tools.map((t) => t.name);
  console.log("tools:", tools.join(", "));

  const tz = "Europe/Berlin";
  const created = await call("create_calendar", {
    name: "Smoke test haircuts",
    timezone: tz,
    slot_minutes: 30,
    hours: [{ day: new Date().getUTCDay(), start: "00:00", end: "23:30" }], // open today so a slot exists now
  });
  console.log("created:", created.calendar_id, "| open_segments:", created.open_segments);

  const from = new Date().toISOString();
  const to = new Date(Date.now() + 6 * 3600_000).toISOString();
  const found = await call("find_slots", { calendar_id: created.calendar_id, from, to, timezone: tz, min_minutes: 30 });
  if (!found.slots.length) throw new Error("no slots found in the next 6h window");
  console.log("found", found.slots.length, "slots; first:", found.slots[0].start_local);

  const slot = found.slots[0];
  const held = await call("hold_slot", {
    calendar_id: created.calendar_id,
    start: slot.start,
    end: new Date(Date.parse(slot.start) + 30 * 60_000).toISOString(),
    timezone: tz,
  });
  console.log("held:", held.hold_id, "expires", held.expires_at_local);

  const committed = await call("commit_hold", { hold_id: held.hold_id, label: "Alex" });
  console.log("committed booking:", committed.booking_id);

  const bookings = await call("list_bookings", { calendar_id: created.calendar_id, timezone: tz });
  console.log("bookings now:", bookings.bookings.length, "| label:", bookings.bookings[0]?.label);

  await call("cancel_booking", { booking_id: committed.booking_id });
  const after = await call("list_bookings", { calendar_id: created.calendar_id, timezone: tz });
  console.log("after cancel:", after.bookings.length);

  if (bookings.bookings.length !== 1 || after.bookings.length !== 0) {
    throw new Error("round-trip assertion failed");
  }
  console.log("\nOK: create → availability → find → hold → commit → list → cancel all work over MCP.");
  await dt.close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("SMOKE FAILED:", err);
  await dt.close().catch(() => {});
  process.exit(1);
});
