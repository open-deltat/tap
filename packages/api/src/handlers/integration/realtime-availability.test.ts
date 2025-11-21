import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type {
	HoldId,
	Resource,
	ResourceId,
	SessionId,
	Tenant,
	TenantId,
} from '@tap/core';
import type { ServerWebSocket } from 'bun';
import { ulid } from 'ulid';
import { getAllocator, getEventStore } from '../../services/context';
import { createTestResource, createTestTenant } from '../test-setup';
import { type WebSocketData, websocketHandler } from '../ws/index';

let testTenant: Tenant;
let testResource: Resource;

beforeAll(async () => {
	try {
		testTenant = await createTestTenant();
		testResource = await createTestResource(testTenant);
	} catch (e) {
		console.error('Setup failed:', e);
		throw e;
	}
});

const createMockWS = (data: WebSocketData) => {
	const sent: string[] = [];
	return {
		data,
		readyState: 1, // OPEN
		send: (msg: string) => sent.push(msg),
		sent,
		close: () => {},
	} as unknown as ServerWebSocket<WebSocketData> & { sent: string[] };
};

describe('Realtime Availability via WebSocket', () => {
	let ws: ReturnType<typeof createMockWS>;
	let cursor: string;
	const sessionId = ('sess_' + ulid()) as SessionId;
	const allocator = getAllocator();
	const eventStore = getEventStore();
	let hold2Id: string;

	test('1. Setup & Initial Hold', async () => {
		console.log('1. Placing Hold 1...');
		const res1 = await allocator.placeHold({
			tenantId: testTenant.id as TenantId,
			resourceId: testResource.id as ResourceId,
			sessionId,
			day: '2025-01-01',
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60000,
		});

		if (res1.success && res1.event) await eventStore.append(res1.event);
		expect(res1.success).toBe(true);
		expect(res1.event).toBeDefined();

		cursor = res1.event!.eventId;
		console.log('Hold 1 placed. Cursor:', cursor);
	});

	test('2. Connect WS', async () => {
		console.log('2. Connecting WS...');
		ws = createMockWS({
			sessionId: ('sess_' + ulid()) as SessionId, // Listener session
			tenantId: testTenant.id as TenantId,
			resourceId: testResource.id as ResourceId,
			cursor,
		});

		await websocketHandler.open(ws);

		// Expect Hello
		expect(ws.sent.length).toBeGreaterThan(0);
		const helloMsg = JSON.parse(ws.sent[0]);
		expect(helloMsg.type).toBe('session.hello');
		expect(helloMsg.cursor).toBe(cursor);
		console.log('WS Connected. Hello received.');
	});

	test('3. Delta Stream', async () => {
		// Ensure Hold 2 has a strictly later timestamp than Hold 1 to guarantee cursor ordering
		await new Promise((r) => setTimeout(r, 100));

		console.log('3. Placing Hold 2...');
		const res2 = await allocator.placeHold({
			tenantId: testTenant.id as TenantId,
			resourceId: testResource.id as ResourceId,
			sessionId, // Owner session
			day: '2025-01-01',
			startMinute: 700,
			endMinute: 760,
			expiresAt: Date.now() + 60000,
		});

		if (res2.success && res2.event) await eventStore.append(res2.event);
		expect(res2.success).toBe(true);
		hold2Id = res2.holdId;
		console.log('Hold 2 placed. ID:', res2.holdId);

		// 4. Wait for WS message
		console.log('4. Waiting for stream...');

		const waitForDelta = async () => {
			const startTime = Date.now();
			// 5s timeout
			while (Date.now() - startTime < 5000) {
				const deltaMsgs = ws.sent.filter((m) => m.includes('"type":"delta"'));
				if (deltaMsgs.length >= 1) return deltaMsgs;
				await new Promise((r) => setTimeout(r, 100));
			}
			return [];
		};

		const deltaMsgs = await waitForDelta();
		console.log('Deltas received:', deltaMsgs.length);

		expect(deltaMsgs.length).toBeGreaterThanOrEqual(1);
		const delta = JSON.parse(deltaMsgs[0]);
		expect(delta.type).toBe('delta');
		expect(delta.event.type).toBe('HoldPlaced');
		expect(delta.event.payload.holdId).toBe(hold2Id);
	});

	afterAll(async () => {
		if (ws) {
			await websocketHandler.close(ws);
		}
	});
});
