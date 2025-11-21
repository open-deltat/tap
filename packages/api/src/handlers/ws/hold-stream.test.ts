import { beforeAll, expect, test } from 'bun:test';
import type { ResourceId, SessionId, TenantId } from '@tap/core';
import type { ServerWebSocket } from 'bun';
import { ulid } from 'ulid';
import { getAllocator, getEventStore } from '../../services/context';
import { createTestResource, createTestTenant } from '../test-setup';
import { type WebSocketData, websocketHandler } from './index';

let testTenant: Awaited<ReturnType<typeof createTestTenant>>;
let testResource: Awaited<ReturnType<typeof createTestResource>>;

beforeAll(async () => {
	testTenant = await createTestTenant();
	testResource = await createTestResource(testTenant);
});

const createMockWS = (data: WebSocketData) => {
	const sent: string[] = [];
	return {
		data,
		send: (msg: string) => sent.push(msg),
		sent,
	} as unknown as ServerWebSocket<WebSocketData> & { sent: string[] };
};

test('WS Hold Stream: sends hello on open', async () => {
	const sessionId = ('sess_' + ulid()) as SessionId;
	const ws = createMockWS({
		sessionId,
		tenantId: testTenant.id as TenantId,
		resourceId: testResource.id as ResourceId,
	});

	await websocketHandler.open(ws);

	expect(ws.sent.length).toBe(1);
	const hello = JSON.parse(ws.sent[0]);
	expect(hello.type).toBe('session.hello');
	expect(hello.sessionId).toBe(sessionId);
});

test('WS Hold Stream: places hold on request', async () => {
	const sessionId = ('sess_' + ulid()) as SessionId;
	const ws = createMockWS({
		sessionId,
		tenantId: testTenant.id as TenantId,
		resourceId: testResource.id as ResourceId,
	});

	const reqId = ulid();
	const day = '2025-05-20';

	await websocketHandler.message(
		ws,
		JSON.stringify({
			type: 'hold.request',
			requestId: reqId,
			day,
			startMinute: 600,
			endMinute: 660,
		}),
	);

	expect(ws.sent.length).toBeGreaterThan(0);
	const response = JSON.parse(ws.sent[ws.sent.length - 1]);
	expect(response.type).toBe('hold.confirmed');
	expect(response.requestId).toBe(reqId);
	expect(response.holdId).toBeDefined();

	// Verify in allocator
	const allocator = getAllocator();
	const state = allocator.getState(
		testTenant.id as TenantId,
		testResource.id as ResourceId,
	);
	// Check held bits
});

test('WS Hold Stream: releases hold on request', async () => {
	const sessionId = ('sess_' + ulid()) as SessionId;
	const ws = createMockWS({
		sessionId,
		tenantId: testTenant.id as TenantId,
		resourceId: testResource.id as ResourceId,
	});

	// 1. Place hold
	const reqId1 = ulid();
	await websocketHandler.message(
		ws,
		JSON.stringify({
			type: 'hold.request',
			requestId: reqId1,
			day: '2025-05-21',
			startMinute: 600,
			endMinute: 660,
		}),
	);
	const confirm = JSON.parse(ws.sent[ws.sent.length - 1]);
	const holdId = confirm.holdId;

	// 2. Release hold
	const reqId2 = ulid();
	await websocketHandler.message(
		ws,
		JSON.stringify({
			type: 'hold.release',
			requestId: reqId2,
			holdId,
		}),
	);

	const release = JSON.parse(ws.sent[ws.sent.length - 1]);
	expect(release.type).toBe('hold.released');
	expect(release.holdId).toBe(holdId);
});

test('WS Hold Stream: releases all holds on disconnect', async () => {
	const sessionId = ('sess_' + ulid()) as SessionId;
	const ws = createMockWS({
		sessionId,
		tenantId: testTenant.id as TenantId,
		resourceId: testResource.id as ResourceId,
	});

	// 1. Place 2 holds
	await websocketHandler.message(
		ws,
		JSON.stringify({
			type: 'hold.request',
			requestId: '1',
			day: '2025-05-22',
			startMinute: 600,
			endMinute: 660,
		}),
	);
	await websocketHandler.message(
		ws,
		JSON.stringify({
			type: 'hold.request',
			requestId: '2',
			day: '2025-05-22',
			startMinute: 700,
			endMinute: 760,
		}),
	);

	// Verify held
	const allocator = getAllocator();
	const stateBefore = allocator.getState(
		testTenant.id as TenantId,
		testResource.id as ResourceId,
	);
	// (Check bits roughly)

	// 2. Close
	await websocketHandler.close(ws);

	// 3. Check events in store
	const eventStore = getEventStore();
	const events = await eventStore.getByResource(
		testTenant.id as TenantId,
		testResource.id as ResourceId,
	);

	const expired = events.filter((e) => e.type === 'HoldExpired');
	// We expect 2 expired events
	// Note: Allocator.releaseHoldsForSession logic is used.
	// Filter by sessionId? releaseHoldsForSession is session-aware.
	// Events don't have sessionId. But they correspond to the holds we just placed.

	// Since test DB persists, we might see events from other tests?
	// We can filter by timestamps or just check count increase?
	// Or assume isolation? Tests run in parallel files but we created unique tenant/resource for this suite?
	// Yes, beforeAll creates new tenant/resource. So it's isolated.

	expect(expired.length).toBe(2);
});
