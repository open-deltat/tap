import { beforeAll, expect, test } from 'bun:test';
import type { ResourceId, SessionId, TenantId } from '@tap/core';
import type { ServerWebSocket } from 'bun';
import { ulid } from 'ulid';
import { handlePublicRequest } from '../public';
import { createTestResource, createTestTenant } from '../test-setup';
import { type WebSocketData, websocketHandler } from '../ws/index';

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

test('Integration: WS Hold -> HTTP Booking fails without sessionId', async () => {
	const sessionId = ('sess_' + ulid()) as SessionId;
	const ws = createMockWS({
		sessionId,
		tenantId: testTenant.id as TenantId,
		resourceId: testResource.id as ResourceId,
	});

	// 1. Place hold via WS
	const reqId = ulid();
	await websocketHandler.message(
		ws,
		JSON.stringify({
			type: 'hold.request',
			requestId: reqId,
			day: '2025-06-01',
			startMinute: 600,
			endMinute: 660,
		}),
	);

	const confirm = JSON.parse(ws.sent[ws.sent.length - 1]);
	expect(confirm.type).toBe('hold.confirmed');
	const holdId = confirm.holdId;

	// 2. Attempt Booking via HTTP (Public)
	const req = new Request(
		`http://localhost/v1/public/${testTenant.slug}/${testResource.slug}/book`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				holdId,
				customerName: 'Test',
				customerEmail: 'test@example.com',
			}),
		},
	);

	const response = await handlePublicRequest(req);
	// Should fail because sessionId mismatch (default vs ws)
	expect(response.status).toBe(404);
});

test('Integration: WS Hold -> HTTP Booking succeeds with sessionId header', async () => {
	const sessionId = ('sess_' + ulid()) as SessionId;
	const ws = createMockWS({
		sessionId,
		tenantId: testTenant.id as TenantId,
		resourceId: testResource.id as ResourceId,
	});

	// 1. Place hold via WS
	const reqId = ulid();
	await websocketHandler.message(
		ws,
		JSON.stringify({
			type: 'hold.request',
			requestId: reqId,
			day: '2025-06-02',
			startMinute: 600,
			endMinute: 660,
		}),
	);

	const confirm = JSON.parse(ws.sent[ws.sent.length - 1]);
	const holdId = confirm.holdId;

	// 2. Attempt Booking via HTTP with Header
	const req = new Request(
		`http://localhost/v1/public/${testTenant.slug}/${testResource.slug}/book`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Tap-Session-Id': sessionId,
			},
			body: JSON.stringify({
				holdId,
				customerName: 'Test',
				customerEmail: 'test@example.com',
			}),
		},
	);

	const response = await handlePublicRequest(req);
	expect(response.status).toBe(201);
	const body = await response.json();
	expect(body.status).toBe('CONFIRMED');
});
