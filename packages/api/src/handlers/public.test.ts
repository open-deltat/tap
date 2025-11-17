import { afterAll, beforeAll, expect, test } from 'bun:test';
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

test('handlePublicRequest returns 404 for unknown route', async () => {
	const req = new Request('http://localhost/v1/public/unknown/route', {
		method: 'GET',
	});

	const response = await handlePublicRequest(req);
	expect(response.status).toBe(404);
});

test('GET /v1/public/:tenantSlug/:resourceSlug/availability returns 400 when from/to missing', async () => {
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

test('GET /v1/public/:tenantSlug/:resourceSlug/availability returns 404 for unknown tenant', async () => {
	const req = new Request(
		'http://localhost/v1/public/unknown/resource/availability?from=2025-12-01T10:00:00Z&to=2025-12-01T18:00:00Z',
		{
			method: 'GET',
		},
	);

	const response = await handlePublicRequest(req);
	expect(response.status).toBe(404);

	const body = await response.json();
	expect(body.error).toBe('Tenant not found');
});

test('GET /v1/public/:tenantSlug/:resourceSlug/availability returns 404 for unknown resource', async () => {
	const req = new Request(
		`http://localhost/v1/public/${testTenant.slug}/unknown/availability?from=2025-12-01T10:00:00Z&to=2025-12-01T18:00:00Z`,
		{
			method: 'GET',
		},
	);

	const response = await handlePublicRequest(req);
	expect(response.status).toBe(404);

	const body = await response.json();
	expect(body.error).toBe('Resource not found');
});

test('GET /v1/public/:tenantSlug/:resourceSlug/availability returns slots for available time', async () => {
	const req = new Request(
		`http://localhost/v1/public/${testTenant.slug}/${testResource.slug}/availability?from=2025-12-01T10:00:00Z&to=2025-12-01T18:00:00Z&durationMinutes=60`,
		{
			method: 'GET',
		},
	);

	const response = await handlePublicRequest(req);
	expect(response.status).toBe(200);

	const body = await response.json();
	expect(body.slots).toBeDefined();
	expect(Array.isArray(body.slots)).toBe(true);
});

test('POST /v1/public/:tenantSlug/:resourceSlug/book returns 400 when required fields missing', async () => {
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

test('POST /v1/public/:tenantSlug/:resourceSlug/book returns 404 for unknown tenant', async () => {
	const req = new Request('http://localhost/v1/public/unknown/resource/book', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			start: '2025-12-01T10:00:00Z',
			end: '2025-12-01T11:00:00Z',
			customerName: 'Test User',
			customerEmail: 'test@example.com',
		}),
	});

	const response = await handlePublicRequest(req);
	expect(response.status).toBe(404);

	const body = await response.json();
	expect(body.error).toBe('Tenant not found');
});

test('POST /v1/public/:tenantSlug/:resourceSlug/book creates booking successfully', async () => {
	const req = new Request(
		`http://localhost/v1/public/${testTenant.slug}/${testResource.slug}/book`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				start: '2025-12-01T10:00:00Z',
				end: '2025-12-01T11:00:00Z',
				customerName: 'Test User',
				customerEmail: 'test@example.com',
			}),
		},
	);

	const response = await handlePublicRequest(req);
	expect(response.status).toBe(201);

	const body = await response.json();
	expect(body.bookingId).toBeDefined();
	expect(body.status).toBe('CONFIRMED');
	expect(body.start).toBeDefined();
	expect(body.end).toBeDefined();
});

test('POST /v1/public/:tenantSlug/:resourceSlug/book returns 409 when slot not available', async () => {
	// Book the slot first
	const firstReq = new Request(
		`http://localhost/v1/public/${testTenant.slug}/${testResource.slug}/book`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				start: '2025-12-02T10:00:00Z',
				end: '2025-12-02T11:00:00Z',
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
				start: '2025-12-02T10:00:00Z',
				end: '2025-12-02T11:00:00Z',
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

test('POST /v1/public/:tenantSlug/:resourceSlug/book includes optional customerPhone', async () => {
	const req = new Request(
		`http://localhost/v1/public/${testTenant.slug}/${testResource.slug}/book`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				start: '2025-12-03T10:00:00Z',
				end: '2025-12-03T11:00:00Z',
				customerName: 'Test User',
				customerEmail: 'test@example.com',
				customerPhone: '+1234567890',
			}),
		},
	);

	const response = await handlePublicRequest(req);
	expect(response.status).toBe(201);

	const body = await response.json();
	expect(body.bookingId).toBeDefined();
});

test('POST /v1/public/:tenantSlug/:resourceSlug/book returns 400 when booking exceeds horizon', async () => {
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

test('handlePublicRequest handles errors gracefully', async () => {
	// Invalid JSON
	const req = new Request(
		`http://localhost/v1/public/${testTenant.slug}/${testResource.slug}/book`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: 'invalid json',
		},
	);

	const response = await handlePublicRequest(req);
	expect(response.status).toBe(500);

	const body = await response.json();
	expect(body.error).toBeDefined();
});
