import { expect, test } from 'bun:test';
import type { ResourceId, TenantId } from '@tap/core';
import { ulid } from 'ulid';
import {
	handlePublicRequest,
	registerResource,
	registerTenant,
} from './public';

test('handlePublicRequest returns 404 for unknown route', async () => {
	const req = new Request('http://localhost/v1/public/unknown/route', {
		method: 'GET',
	});

	const response = await handlePublicRequest(req);
	expect(response.status).toBe(404);
});

test('GET /v1/public/:tenantSlug/:resourceSlug/availability returns 400 when from/to missing', async () => {
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	registerTenant('test-tenant', tenantId);
	registerResource('test-tenant', 'test-resource', resourceId, tenantId);

	const req = new Request(
		'http://localhost/v1/public/test-tenant/test-resource/availability',
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
	const tenantId = ulid() as TenantId;

	registerTenant('test-tenant', tenantId);

	const req = new Request(
		'http://localhost/v1/public/test-tenant/unknown/availability?from=2025-12-01T10:00:00Z&to=2025-12-01T18:00:00Z',
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
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	registerTenant('test-tenant', tenantId);
	registerResource('test-tenant', 'test-resource', resourceId, tenantId);

	const req = new Request(
		'http://localhost/v1/public/test-tenant/test-resource/availability?from=2025-12-01T10:00:00Z&to=2025-12-01T18:00:00Z&durationMinutes=60',
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
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	registerTenant('test-tenant', tenantId);
	registerResource('test-tenant', 'test-resource', resourceId, tenantId);

	const req = new Request(
		'http://localhost/v1/public/test-tenant/test-resource/book',
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
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	registerTenant('test-tenant', tenantId);
	registerResource('test-tenant', 'test-resource', resourceId, tenantId);

	const req = new Request(
		'http://localhost/v1/public/test-tenant/test-resource/book',
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
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	registerTenant('test-tenant', tenantId);
	registerResource('test-tenant', 'test-resource', resourceId, tenantId);

	// Book the slot first
	const firstReq = new Request(
		'http://localhost/v1/public/test-tenant/test-resource/book',
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				start: '2025-12-01T10:00:00Z',
				end: '2025-12-01T11:00:00Z',
				customerName: 'First User',
				customerEmail: 'first@example.com',
			}),
		},
	);

	await handlePublicRequest(firstReq);

	// Try to book the same slot again
	const secondReq = new Request(
		'http://localhost/v1/public/test-tenant/test-resource/book',
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				start: '2025-12-01T10:00:00Z',
				end: '2025-12-01T11:00:00Z',
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
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	registerTenant('test-tenant', tenantId);
	registerResource('test-tenant', 'test-resource', resourceId, tenantId);

	const req = new Request(
		'http://localhost/v1/public/test-tenant/test-resource/book',
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				start: '2025-12-01T10:00:00Z',
				end: '2025-12-01T11:00:00Z',
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

test('handlePublicRequest handles errors gracefully', async () => {
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	registerTenant('test-tenant', tenantId);
	registerResource('test-tenant', 'test-resource', resourceId, tenantId);

	// Invalid JSON
	const req = new Request(
		'http://localhost/v1/public/test-tenant/test-resource/book',
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
