import { describe, expect, it, beforeAll, afterAll, beforeEach } from "bun:test";
import server from "../src/index";
import { resetCore } from "../src/core";
import type { AvailabilityPostResponse, BookPostResponse, AvailabilityWsServerMessage, HoldWsServerMessage } from "@tap/core";

const BASE_URL = `http://localhost:${server.port}`;
const WS_BASE_URL = `ws://localhost:${server.port}`;

const TENANT_ID = "01AN4Z07BY79KA1307SR9X4MV3";
const RESOURCE_ID = "01AN4Z07BY79KA1307SR9X4MV4";
// Use a fixed date range
const FROM = "2025-01-01T00:00:00.000Z";
const TO = "2025-01-02T00:00:00.000Z";

// Helper to wait for WS message
function waitForMessage(ws: WebSocket, predicate: (msg: any) => boolean, existingMessages: any[] = []): Promise<any> {
  // Check existing messages first
  const existing = existingMessages.find(predicate);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string);

      if (predicate(msg)) {
        ws.removeEventListener("message", handler);
        clearTimeout(timer); // Clear timeout
        resolve(msg);
      }
    };
    ws.addEventListener("message", handler);
    // Timeout
    const timer = setTimeout(() => {
        ws.removeEventListener("message", handler);
        console.log("Wait for message timed out for predicate:", predicate.toString());
        resolve(undefined);
    }, 3000);
  });
}

describe("TAP API Integration", () => {
  beforeEach(() => {
    resetCore();
  });

  afterAll(() => {
    server.stop();
  });

  it("should return availability", async () => {
    const response = await fetch(`${BASE_URL}/availability`, {
      method: "POST",
      body: JSON.stringify({
        tenantId: TENANT_ID,
        resourceId: RESOURCE_ID,
        from: FROM,
        to: TO,
        slotDurationMinutes: 60
      }),
      headers: { "Content-Type": "application/json" }
    });

    expect(response.status).toBe(200);
    const data = await response.json() as AvailabilityPostResponse;
    expect(data.freeSlots.length).toBeGreaterThan(0);
    expect(data.freeSlots[0].start).toBe("2025-01-01T09:00:00.000Z"); // Default offer starts at 9
  });

  it("should handle hold and booking flow with websockets", async () => {
    // 1. Get availability
    const availRes = await fetch(`${BASE_URL}/availability`, {
        method: "POST",
        body: JSON.stringify({
          tenantId: TENANT_ID,
          resourceId: RESOURCE_ID,
          from: FROM,
          to: TO,
          slotDurationMinutes: 60
        }),
        headers: { "Content-Type": "application/json" }
      });
    const availData = await availRes.json() as AvailabilityPostResponse;
    const slotToBook = availData.freeSlots[0];

    // 2. Connect to Availability WS
    const availWs = new WebSocket(`${WS_BASE_URL}/availability-ws`);
    const availMessages: any[] = [];
    availWs.addEventListener("message", (e) => {
        availMessages.push(JSON.parse(e.data as string));
    });

    await new Promise(r => availWs.onopen = r);

    const helloPromise = waitForMessage(availWs, m => m.type === 'stream.hello', availMessages);
    const hello = await helloPromise as AvailabilityWsServerMessage;
    expect(hello).toBeDefined();

    // Subscribe
    availWs.send(JSON.stringify({
        type: 'stream.subscribe',
        tenantId: TENANT_ID,
        resourceId: RESOURCE_ID
    }));

    // Wait a bit for subscription to be registered on server (async)
    await new Promise(r => setTimeout(r, 500));

    // 4. Setup listener for HoldPlaced delta BEFORE triggering action
    // Note: ws.publish is async and might take a moment
    const deltaPromise = waitForMessage(availWs, m => m.type === 'stream.delta' && m.payload.kind === 'HoldPlaced', availMessages);

    // 3. Connect to Hold WS to place hold
    // The connection itself should place the hold
    const holdUrl = `${WS_BASE_URL}/hold-ws?tenantId=${TENANT_ID}&resourceId=${RESOURCE_ID}&slotId=${slotToBook.slotId}`;
    const holdWs = new WebSocket(holdUrl);
    const holdMessages: any[] = [];
    holdWs.addEventListener("message", (e) => holdMessages.push(JSON.parse(e.data as string)));

    await new Promise(r => holdWs.onopen = r);

    const holdHelloPromise = waitForMessage(holdWs, m => m.type === 'hold.session.hello', holdMessages);
    const holdHello = await holdHelloPromise as HoldWsServerMessage;
    expect(holdHello).toBeDefined();

    const holdConfirmedPromise = waitForMessage(holdWs, m => m.type === 'hold.confirmed', holdMessages);
    // Wait for confirmation before checking availability delta
    const holdConfirmed = await holdConfirmedPromise as any;
    expect(holdConfirmed).toBeDefined();
    expect(holdConfirmed.holdId).toBeDefined();

    // Check Availability WS for HoldPlaced delta
    const delta = await deltaPromise as any;
    expect(delta).toBeDefined();
    expect(delta.payload.slotId).toBe(slotToBook.slotId);

    // 5. Verify slot is gone from availability
    const availRes2 = await fetch(`${BASE_URL}/availability`, {
        method: "POST",
        body: JSON.stringify({
          tenantId: TENANT_ID,
          resourceId: RESOURCE_ID,
          from: FROM,
          to: TO,
          slotDurationMinutes: 60
        }),
        headers: { "Content-Type": "application/json" }
    });
    const availData2 = await availRes2.json() as AvailabilityPostResponse;
    expect(availData2.freeSlots.find(s => s.slotId === slotToBook.slotId)).toBeUndefined();

    // 6. Book the slot
    // Setup listener BEFORE triggering action to avoid race condition
    const bookingDeltaPromise = waitForMessage(availWs, m => m.type === 'stream.delta' && m.payload.kind === 'BookingConfirmed', availMessages);

    const bookRes = await fetch(`${BASE_URL}/book`, {
        method: "POST",
        body: JSON.stringify({
            tenantId: TENANT_ID,
            resourceId: RESOURCE_ID,
            slotId: slotToBook.slotId,
            holdId: holdConfirmed.holdId,
            holdSessionId: (holdHello as any).sessionId,
            customer: {
                name: "John Doe",
                email: "john@example.com"
            }
        }),
        headers: { "Content-Type": "application/json" }
    });

    expect(bookRes.status).toBe(200);
    const bookData = await bookRes.json() as BookPostResponse;
    expect(bookData.bookingId).toBeDefined();

    // 7. Check Availability WS for BookingConfirmed delta
    const bookingDelta = await bookingDeltaPromise as any;
    expect(bookingDelta).toBeDefined();
    expect(bookingDelta.payload.bookingId).toBe(bookData.bookingId);

    availWs.close();
    holdWs.close();
  });

  it("should handle instant booking without hold", async () => {
     // Get a slot
     const availRes = await fetch(`${BASE_URL}/availability`, {
        method: "POST",
        body: JSON.stringify({
          tenantId: TENANT_ID,
          resourceId: RESOURCE_ID,
          from: FROM,
          to: TO,
          slotDurationMinutes: 60
        }),
        headers: { "Content-Type": "application/json" }
      });
    const availData = await availRes.json() as AvailabilityPostResponse;
    const slotToBook = availData.freeSlots[1]; // Use a different slot

    const bookRes = await fetch(`${BASE_URL}/book`, {
        method: "POST",
        body: JSON.stringify({
            tenantId: TENANT_ID,
            resourceId: RESOURCE_ID,
            slotId: slotToBook.slotId,
            // No holdId/sessionId
            customer: {
                name: "Jane Doe",
                email: "jane@example.com"
            }
        }),
        headers: { "Content-Type": "application/json" }
    });

    expect(bookRes.status).toBe(200);
    const bookData = await bookRes.json() as BookPostResponse;
    expect(bookData.bookingId).toBeDefined();
  });
});
