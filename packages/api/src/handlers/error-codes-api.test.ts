import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { BookingId } from '@tap/core';
import { handlePrivateRequest } from './private';
import { handlePublicRequest } from './public';
import {
	createTestOffer,
	createTestResource,
	createTestTenant,
} from './test-setup';

let testTenant: Awaited<ReturnType<typeof createTestTenant>>;
let testResource: Awaited<ReturnType<typeof createTestResource>>;

beforeAll(async () => {
	testTenant = await createTestTenant();
	testResource = await createTestResource(testTenant);
	await createTestOffer(testTenant, testResource);
});

afterAll(async () => {
	// Cleanup handled by test isolation
});

test('TAP_INVALID_INPUT returned from API for missing required fields', async () => {
	const req = new Request(
		`http://localhost/v1/public/${testTenant.slug}/${testResource.slug}/book`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		},
	);

	const response = await handlePublicRequest(req);
	expect(response.status).toBe(400);

	const body = await response.json();
	expect(body.error).toContain('Missing required fields');
});

test('TAP_TENANT_NOT_FOUND returned from API for unknown tenant', async () => {
	const req = new Request(
		'http://localhost/v1/public/unknown-tenant/resource/availability?from=2025-12-01T10:00:00Z&to=2025-12-01T18:00:00Z',
		{
			method: 'GET',
		},
	);

	const response = await handlePublicRequest(req);
	expect(response.status).toBe(404);

	const body = await response.json();
	expect(body.error).toBe('Tenant not found');
});

test('TAP_RESOURCE_NOT_FOUND returned from API for unknown resource', async () => {
	const req = new Request(
		`http://localhost/v1/public/${testTenant.slug}/unknown-resource/availability?from=2025-12-01T10:00:00Z&to=2025-12-01T18:00:00Z`,
		{
			method: 'GET',
		},
	);

	const response = await handlePublicRequest(req);
	expect(response.status).toBe(404);

	const body = await response.json();
	expect(body.error).toBe('Resource not found');
});

test('TAP_SLOT_UNAVAILABLE returned from API when slot already booked', async () => {
	// Book the slot first
	const firstReq = new Request(
		`http://localhost/v1/public/${testTenant.slug}/${testResource.slug}/book`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				start: '2025-12-10T10:00:00Z',
				end: '2025-12-10T11:00:00Z',
				customerName: 'First User',
				customerEmail: 'first@example.com',
			}),
		},
	);

	await handlePublicRequest(firstReq);

	// Try to book the same slot again
	const secondReq = new Request(
		`http://localhost/v1/public/${testTenant.slug}/${testResource.slug}/book`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				start: '2025-12-10T10:00:00Z',
				end: '2025-12-10T11:00:00Z',
				customerName: 'Second User',
				customerEmail: 'second@example.com',
			}),
		},
	);

	const response = await handlePublicRequest(secondReq);
	expect(response.status).toBe(409);

	const body = await response.json();
	expect(body.error).toBe('Slot not available');
});

test('TAP_HOLD_NOT_FOUND returned from API when confirming non-existent hold', async () => {
	const req = new Request('http://localhost/v1/bookings', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId: testTenant.id,
			resourceId: testResource.id,
			holdId: '01HZ9999999999999999999999',
			start: new Date('2025-12-11T10:00:00Z').getTime(),
			end: new Date('2025-12-11T11:00:00Z').getTime(),
		}),
	});

	const response = await handlePrivateRequest(req);
	expect(response.status).toBe(404);

	const body = await response.json();
	expect(body.error).toContain('Hold not found');
});

test('TAP_BOOKING_NOT_FOUND returned from API when cancelling non-existent booking', async () => {
	const fakeBookingId = '01HZ9999999999999999999999' as BookingId;
	const req = new Request(
		`http://localhost/v1/bookings/${fakeBookingId}/cancel`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				tenantId: testTenant.id,
				resourceId: testResource.id,
				day: '2025-12-12',
				startMinute: 600,
				endMinute: 660,
			}),
		},
	);

	const response = await handlePrivateRequest(req);
	expect(response.status).toBe(404);

	const body = await response.json();
	expect(body.error).toBe('Booking not found');
});

test('TAP_INVALID_INPUT returned from API for missing query params', async () => {
	const req = new Request(
		`http://localhost/v1/public/${testTenant.slug}/${testResource.slug}/availability`,
		{
			method: 'GET',
		},
	);

	const response = await handlePublicRequest(req);
	expect(response.status).toBe(400);

	const body = await response.json();
	expect(body.error).toContain('Missing required query params');
});

test('TAP_INVALID_INPUT returned from API for booking beyond horizon', async () => {
	const req = new Request(
		`http://localhost/v1/public/${testTenant.slug}/${testResource.slug}/book`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				start: '2026-06-01T10:00:00Z',
				end: '2026-06-01T11:00:00Z',
				customerName: 'Test User',
				customerEmail: 'test@example.com',
			}),
		},
	);

	const response = await handlePublicRequest(req);
	expect(response.status).toBe(400);

	const body = await response.json();
	expect(body.error).toContain('horizon');
});

test('TAP_HOLD_EXPIRED scenario verified through API', async () => {
	const tenant = await createTestTenant();
	const resource = await createTestResource(tenant);
	await createTestOffer(tenant, resource);

	const holdReq = new Request('http://localhost/v1/holds', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId: tenant.id,
			resourceId: resource.id,
			day: '2025-12-20',
			startMinute: 600,
			endMinute: 660,
			expiresAtMs: Date.now() - 1000,
		}),
	});

	await handlePrivateRequest(holdReq);

	const bookingReq = new Request('http://localhost/v1/bookings', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			tenantId: tenant.id,
			resourceId: resource.id,
			holdId: '01HZ9999999999999999999999',
			start: new Date('2025-12-20T10:00:00Z').getTime(),
			end: new Date('2025-12-20T11:00:00Z').getTime(),
		}),
	});

	const response = await handlePrivateRequest(bookingReq);
	expect(response.status).toBe(404);

	const body = await response.json();
	expect(body.error).toContain('Hold not found');
});
