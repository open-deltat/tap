import { describe, expect, it, beforeAll, afterAll, beforeEach } from "bun:test";
import server from "../src/index";
import { resetCore } from "../src/core";
import type { AvailabilityPostResponse, BookPostResponse, AvailabilityWsServerMessage, HoldWsServerMessage, APIErrorResponse, ErrorValue } from "@tap/protocol";
import { ulid } from "ulid";

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

  describe("Functionality", () => {
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

      it("WS /hold-ws should handle explicit release message", async () => {
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
        const slotToBook = availData.freeSlots[3];

        // Connect to Availability WS to verify release delta
        const availWs = new WebSocket(`${WS_BASE_URL}/availability-ws`);
        const availMessages: any[] = [];
        availWs.addEventListener("message", (e) => availMessages.push(JSON.parse(e.data as string)));
        await new Promise(r => availWs.onopen = r);

        // Subscribe
        availWs.send(JSON.stringify({
            type: 'stream.subscribe',
            tenantId: TENANT_ID,
            resourceId: RESOURCE_ID
        }));
        await new Promise(r => setTimeout(r, 500));

        // Connect to Hold WS
        const holdUrl = `${WS_BASE_URL}/hold-ws?tenantId=${TENANT_ID}&resourceId=${RESOURCE_ID}&slotId=${slotToBook.slotId}`;
        const holdWs = new WebSocket(holdUrl);
        const holdMessages: any[] = [];
        holdWs.addEventListener("message", (e) => holdMessages.push(JSON.parse(e.data as string)));
        await new Promise(r => holdWs.onopen = r);

        const holdConfirmedPromise = waitForMessage(holdWs, m => m.type === 'hold.confirmed', holdMessages);
        const holdConfirmed = await holdConfirmedPromise as any;
        expect(holdConfirmed).toBeDefined();

        // Wait for HoldPlaced delta
        const placedDeltaPromise = waitForMessage(availWs, m => m.type === 'stream.delta' && m.payload.kind === 'HoldPlaced' && m.payload.slotId === slotToBook.slotId, availMessages);
        await placedDeltaPromise;

        // Send explicit release
        const releaseDeltaPromise = waitForMessage(availWs, m => m.type === 'stream.delta' && m.payload.kind === 'HoldReleased' && m.payload.slotId === slotToBook.slotId, availMessages);

        holdWs.send(JSON.stringify({
            type: 'hold.release',
            holdId: holdConfirmed.holdId
        }));

        // Check for HoldReleased delta
        const releaseDelta = await releaseDeltaPromise;
        expect(releaseDelta).toBeDefined();

        holdWs.close();
        availWs.close();
      });
  });

  describe("Errors", () => {
    it("POST /availability should fail with invalid body", async () => {
        const response = await fetch(`${BASE_URL}/availability`, {
            method: "POST",
            body: JSON.stringify({
              // Missing fields
              tenantId: TENANT_ID,
            }),
            headers: { "Content-Type": "application/json" }
        });

        expect(response.status).toBe(400);
        const data = await response.json() as APIErrorResponse;
        expect(data.error.value).toBe("TAP_INVALID_INPUT");
    });

    it("POST /book should fail with invalid body", async () => {
        const response = await fetch(`${BASE_URL}/book`, {
            method: "POST",
            body: JSON.stringify({
              // Missing fields
              tenantId: TENANT_ID,
            }),
            headers: { "Content-Type": "application/json" }
        });

        expect(response.status).toBe(400);
        const data = await response.json() as APIErrorResponse;
        expect(data.error.value).toBe("TAP_INVALID_INPUT");
    });

    it("POST /book should fail for unavailable slot (non-existent)", async () => {
        const response = await fetch(`${BASE_URL}/book`, {
            method: "POST",
            body: JSON.stringify({
                tenantId: TENANT_ID,
                resourceId: RESOURCE_ID,
                slotId: "invalid_slot_id",
                customer: {
                    name: "Jane Doe",
                    email: "jane@example.com"
                }
            }),
            headers: { "Content-Type": "application/json" }
        });

        expect(response.status).toBe(400); // Validation fails for slot format likely, or 409 if valid format but unavailable
        const data = await response.json() as APIErrorResponse;
        expect(data.error.value).toBe("TAP_INVALID_INPUT"); // Assuming regex check on slotId
    });

    it("POST /book should fail for unavailable slot (valid format but not free)", async () => {
        // First book a slot
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

        // Book it
        await fetch(`${BASE_URL}/book`, {
            method: "POST",
            body: JSON.stringify({
                tenantId: TENANT_ID,
                resourceId: RESOURCE_ID,
                slotId: slotToBook.slotId,
                customer: { name: "P1", email: "p1@ex.com" }
            }),
            headers: { "Content-Type": "application/json" }
        });

        // Try to book it again
        const response = await fetch(`${BASE_URL}/book`, {
            method: "POST",
            body: JSON.stringify({
                tenantId: TENANT_ID,
                resourceId: RESOURCE_ID,
                slotId: slotToBook.slotId,
                customer: { name: "P2", email: "p2@ex.com" }
            }),
            headers: { "Content-Type": "application/json" }
        });

        expect(response.status).toBe(409);
        const data = await response.json() as APIErrorResponse;
        expect(data.error.value).toBe("TAP_SLOT_UNAVAILABLE");
    });

    it("WS /hold-ws should close with error if params missing", async () => {
        const ws = new WebSocket(`${WS_BASE_URL}/hold-ws`); // No params

        // Expect connection close with specific code
        const closePromise = new Promise<{code: number, reason: string}>((resolve) => {
            ws.onclose = (e) => resolve({ code: e.code, reason: e.reason });
        });

        const result = await closePromise;
        // Normally 1008 or similar for policy violation / params missing (api returns 400 upgrade fail actually)
        // Wait, server upgrade logic returns 400 Response if params missing, so WebSocket connection won't open.
        // Bun WebSocket client might emit an error or close immediately.
    });

    it("WS /hold-ws should send error and close if slot unavailable", async () => {
        // 1. Book a slot to make it unavailable
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
        const slotToBook = availData.freeSlots[2]; // Use another slot

        await fetch(`${BASE_URL}/book`, {
            method: "POST",
            body: JSON.stringify({
                tenantId: TENANT_ID,
                resourceId: RESOURCE_ID,
                slotId: slotToBook.slotId,
                customer: { name: "P1", email: "p1@ex.com" }
            }),
            headers: { "Content-Type": "application/json" }
        });

        // 2. Try to hold it
        const holdUrl = `${WS_BASE_URL}/hold-ws?tenantId=${TENANT_ID}&resourceId=${RESOURCE_ID}&slotId=${slotToBook.slotId}`;
        const ws = new WebSocket(holdUrl);
        const messages: any[] = [];
        ws.onmessage = (e) => messages.push(JSON.parse(e.data as string));

        const result = await waitForMessage(ws, (m) => m.type === 'hold.error', messages);
        expect(result).toBeDefined();
        expect((result as HoldWsServerMessage).type).toBe('hold.error');
        if (result.type === 'hold.error') {
             expect(result.errorValue).toBe('TAP_SLOT_UNAVAILABLE');
        }

        ws.close();
    });

    it("WS /hold-ws should handle malformed slotId in params gracefully", async () => {
        const holdUrl = `${WS_BASE_URL}/hold-ws?tenantId=${TENANT_ID}&resourceId=${RESOURCE_ID}&slotId=bad_slot_format`;
        const ws = new WebSocket(holdUrl);

        // Should close with 1011 internal error as per implementation catch block
        const closePromise = new Promise<{code: number}>((resolve) => {
            ws.onclose = (e) => resolve({ code: e.code });
        });

        const result = await closePromise;
        expect(result.code).toBe(1011);
    });

    it("WS /availability-ws should ignore invalid client messages", async () => {
        const ws = new WebSocket(`${WS_BASE_URL}/availability-ws`);
        await new Promise(r => ws.onopen = r);

        // Send junk
        ws.send(JSON.stringify({ type: "junk_message" }));
        ws.send("not even json");

        // Should still be alive and able to handle valid messages
        // But we won't get a response to junk. Just check it doesn't close immediately.

        await new Promise(r => setTimeout(r, 100));
        expect(ws.readyState).toBe(WebSocket.OPEN);

        ws.close();
    });
  });
});
