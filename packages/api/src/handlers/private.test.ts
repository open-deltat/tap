import { expect, test } from 'bun:test';
import type {
	BookingId,
	HoldId,
	LedgerEvent,
	ResourceId,
	TenantId,
} from '@tap/core';
import { ulid } from 'ulid';
import { handlePrivateRequest } from './private';

test('handlePrivateRequest returns 404 for unknown route', async () => {
	const req = new Request('http://localhost/v1/unknown', {
		method: 'GET',
	});

	const response = await handlePrivateRequest(req);
	expect(response.status).toBe(404);
});

test('GET /v1/availability returns 400 when required params missing', async () => {
	const req = new Request('http://localhost/v1/availability', {
		method: 'GET',
	});

	const response = await handlePrivateRequest(req);
	expect(response.status).toBe(400);

	const body = await response.json();
	expect(body.error).toContain('Missing required params');
});

test('GET /v1/availability returns available state for new day', async () => {
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const req = new Request(
		`http://localhost/v1/availability?tenantId=${tenantId}&resourceId=${resourceId}&day=2025-12-01`,
		{
			method: 'GET',
		},
	);

	const response = await handlePrivateRequest(req);
	expect(response.status).toBe(200);

	const body = await response.json();
	expect(body.day).toBe('2025-12-01');
	expect(body.available).toBe(true);
	expect(body.booked).toEqual([]);
	expect(body.held).toEqual([]);
});

test('GET /v1/availability returns booked and held minutes for existing day', async () => {
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-01';

	// Place a hold via API
	const holdReq = new Request('http://localhost/v1/holds', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			day,
			startMinute: 600,
			endMinute: 660,
			expiresAtMs: Date.now() + 60_000,
		}),
	});

	await handlePrivateRequest(holdReq);

	const req = new Request(
		`http://localhost/v1/availability?tenantId=${tenantId}&resourceId=${resourceId}&day=${day}`,
		{
			method: 'GET',
		},
	);

	const response = await handlePrivateRequest(req);
	expect(response.status).toBe(200);

	const body = await response.json();
	expect(body.booked).toBeDefined();
	expect(Array.isArray(body.booked)).toBe(true);
});

test('POST /v1/holds returns 400 when required fields missing', async () => {
	const req = new Request('http://localhost/v1/holds', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({}),
	});

	const response = await handlePrivateRequest(req);
	expect(response.status).toBe(400);

	const body = await response.json();
	expect(body.error).toContain('Missing required fields');
});

test('POST /v1/holds creates hold successfully', async () => {
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const req = new Request('http://localhost/v1/holds', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			day: '2025-12-01',
			startMinute: 600,
			endMinute: 660,
			expiresAtMs: Date.now() + 60_000,
		}),
	});

	const response = await handlePrivateRequest(req);
	expect(response.status).toBe(201);

	const body = await response.json();
	expect(body.holdId).toBeDefined();
	expect(body.event).toBeDefined();
	expect(body.event.type).toBe('HoldPlaced');
});

test('POST /v1/holds returns 409 when slot not available', async () => {
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	// Place first hold
	const firstReq = new Request('http://localhost/v1/holds', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			day: '2025-12-01',
			startMinute: 600,
			endMinute: 660,
			expiresAtMs: Date.now() + 60_000,
		}),
	});

	await handlePrivateRequest(firstReq);

	// Try to place overlapping hold
	const secondReq = new Request('http://localhost/v1/holds', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			day: '2025-12-01',
			startMinute: 600,
			endMinute: 660,
			expiresAtMs: Date.now() + 60_000,
		}),
	});

	const response = await handlePrivateRequest(secondReq);
	expect(response.status).toBe(409);

	const body = await response.json();
	expect(body.error).toBe('Slot not available');
});

test('POST /v1/holds uses default expiresAt when not provided', async () => {
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const req = new Request('http://localhost/v1/holds', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			day: '2025-12-01',
			startMinute: 600,
			endMinute: 660,
		}),
	});

	const response = await handlePrivateRequest(req);
	expect(response.status).toBe(201);

	const body = await response.json();
	expect(body.holdId).toBeDefined();
});

test('POST /v1/holds includes optional clientRef', async () => {
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const req = new Request('http://localhost/v1/holds', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			day: '2025-12-01',
			startMinute: 600,
			endMinute: 660,
			clientRef: 'external-ref-123',
		}),
	});

	const response = await handlePrivateRequest(req);
	expect(response.status).toBe(201);

	const body = await response.json();
	expect(body.event.payload.clientRef).toBe('external-ref-123');
});

test('POST /v1/bookings returns 400 when required fields missing', async () => {
	const req = new Request('http://localhost/v1/bookings', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({}),
	});

	const response = await handlePrivateRequest(req);
	expect(response.status).toBe(400);

	const body = await response.json();
	expect(body.error).toContain('Missing required fields');
});

test('POST /v1/bookings creates booking from hold successfully', async () => {
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-01';

	// Place hold via API first
	const holdReq = new Request('http://localhost/v1/holds', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			day,
			startMinute: 600,
			endMinute: 660,
			expiresAtMs: Date.now() + 60_000,
		}),
	});

	const holdResponse = await handlePrivateRequest(holdReq);
	if (holdResponse.status !== 201) {
		throw new Error('Hold placement failed');
	}

	const holdBody = await holdResponse.json();
	const holdId = holdBody.holdId;

	const req = new Request('http://localhost/v1/bookings', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			holdId,
			customerName: 'Test User',
			customerEmail: 'test@example.com',
		}),
	});

	const response = await handlePrivateRequest(req);
	expect(response.status).toBe(200);

	const body = await response.json();
	expect(body.bookingId).toBeDefined();
	expect(body.event).toBeDefined();
	expect(body.event.type).toBe('BookingConfirmed');
});

test('POST /v1/bookings returns 404 when hold not found', async () => {
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const req = new Request('http://localhost/v1/bookings', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			holdId: ulid() as HoldId,
		}),
	});

	const response = await handlePrivateRequest(req);
	expect(response.status).toBe(404);

	const body = await response.json();
	expect(body.error).toContain('Hold not found');
});

test('POST /v1/bookings uses provided bookingId', async () => {
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-01';
	const bookingId = ulid() as BookingId;

	// Place hold via API first
	const holdReq = new Request('http://localhost/v1/holds', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			day,
			startMinute: 600,
			endMinute: 660,
			expiresAtMs: Date.now() + 60_000,
		}),
	});

	const holdResponse = await handlePrivateRequest(holdReq);
	if (holdResponse.status !== 201) {
		throw new Error('Hold placement failed');
	}

	const holdBody = await holdResponse.json();
	const holdId = holdBody.holdId;

	const req = new Request('http://localhost/v1/bookings', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			holdId,
			bookingId,
		}),
	});

	const response = await handlePrivateRequest(req);
	expect(response.status).toBe(200);

	const body = await response.json();
	expect(body.bookingId).toBe(bookingId);
});

test('POST /v1/bookings includes optional customer and payment fields', async () => {
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-01';

	// Place hold via API first
	const holdReq = new Request('http://localhost/v1/holds', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			day,
			startMinute: 600,
			endMinute: 660,
			expiresAtMs: Date.now() + 60_000,
		}),
	});

	const holdResponse = await handlePrivateRequest(holdReq);
	if (holdResponse.status !== 201) {
		throw new Error('Hold placement failed');
	}

	const holdBody = await holdResponse.json();
	const holdId = holdBody.holdId;

	const req = new Request('http://localhost/v1/bookings', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			holdId,
			customerName: 'Test User',
			customerEmail: 'test@example.com',
			customerPhone: '+1234567890',
			paymentStatus: 'PAID',
			priceCents: 5000,
		}),
	});

	const response = await handlePrivateRequest(req);
	expect(response.status).toBe(200);

	const body = await response.json();
	expect(body.event.payload.customerName).toBe('Test User');
	expect(body.event.payload.customerEmail).toBe('test@example.com');
	expect(body.event.payload.customerPhone).toBe('+1234567890');
	expect(body.event.payload.paymentStatus).toBe('PAID');
	expect(body.event.payload.priceCents).toBe(5000);
});

test('GET /v1/events returns all events when no filters', async () => {
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-01';

	// Create some events via API
	const holdReq = new Request('http://localhost/v1/holds', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			day,
			startMinute: 600,
			endMinute: 660,
			expiresAtMs: Date.now() + 60_000,
		}),
	});

	await handlePrivateRequest(holdReq);

	const req = new Request('http://localhost/v1/events', {
		method: 'GET',
	});

	const response = await handlePrivateRequest(req);
	expect(response.status).toBe(200);

	const body = await response.json();
	expect(body.events).toBeDefined();
	expect(Array.isArray(body.events)).toBe(true);
});

test('GET /v1/events filters events by tenantId', async () => {
	const tenantId1 = ulid() as TenantId;
	const tenantId2 = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-01';

	// Create events for tenant 1 via API
	const holdReq1 = new Request('http://localhost/v1/holds', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId: tenantId1,
			resourceId,
			day,
			startMinute: 600,
			endMinute: 660,
			expiresAtMs: Date.now() + 60_000,
		}),
	});

	await handlePrivateRequest(holdReq1);

	// Create events for tenant 2 via API
	const holdReq2 = new Request('http://localhost/v1/holds', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId: tenantId2,
			resourceId,
			day,
			startMinute: 700,
			endMinute: 760,
			expiresAtMs: Date.now() + 60_000,
		}),
	});

	await handlePrivateRequest(holdReq2);

	const req = new Request(`http://localhost/v1/events?tenantId=${tenantId1}`, {
		method: 'GET',
	});

	const response = await handlePrivateRequest(req);
	expect(response.status).toBe(200);

	const body = await response.json();
	expect(body.events.length).toBeGreaterThan(0);
	expect(body.events.every((e: LedgerEvent) => e.tenantId === tenantId1)).toBe(
		true,
	);
});

test('GET /v1/events respects limit parameter', async () => {
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-01';

	// Create multiple events via API
	for (let i = 0; i < 5; i++) {
		const holdReq = new Request('http://localhost/v1/holds', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				tenantId,
				resourceId,
				day,
				startMinute: 600 + i * 60,
				endMinute: 660 + i * 60,
				expiresAtMs: Date.now() + 60_000,
			}),
		});

		await handlePrivateRequest(holdReq);
	}

	const req = new Request('http://localhost/v1/events?limit=2', {
		method: 'GET',
	});

	const response = await handlePrivateRequest(req);
	expect(response.status).toBe(200);

	const body = await response.json();
	expect(body.events.length).toBeLessThanOrEqual(2);
});

test('GET /v1/events uses cursor for pagination', async () => {
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-01';

	// Create events via API
	const holdReq = new Request('http://localhost/v1/holds', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId,
			resourceId,
			day,
			startMinute: 600,
			endMinute: 660,
			expiresAtMs: Date.now() + 60_000,
		}),
	});

	await handlePrivateRequest(holdReq);

	// Get first page
	const firstReq = new Request('http://localhost/v1/events?limit=1', {
		method: 'GET',
	});

	const firstResponse = await handlePrivateRequest(firstReq);
	const firstBody = await firstResponse.json();

	if (firstBody.events.length > 0 && firstBody.nextCursor) {
		// Get next page using cursor
		const secondReq = new Request(
			`http://localhost/v1/events?cursor=${firstBody.nextCursor}`,
			{
				method: 'GET',
			},
		);

		const secondResponse = await handlePrivateRequest(secondReq);
		expect(secondResponse.status).toBe(200);

		const secondBody = await secondResponse.json();
		expect(secondBody.events).toBeDefined();
	}
});

test('GET /v1/events defaults limit to 100', async () => {
	const req = new Request('http://localhost/v1/events', {
		method: 'GET',
	});

	const response = await handlePrivateRequest(req);
	expect(response.status).toBe(200);

	const body = await response.json();
	expect(body.events.length).toBeLessThanOrEqual(100);
});

test('handlePrivateRequest handles errors gracefully', async () => {
	const req = new Request('http://localhost/v1/holds', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: 'invalid json',
	});

	const response = await handlePrivateRequest(req);
	expect(response.status).toBe(500);

	const body = await response.json();
	expect(body.error).toBeDefined();
});
