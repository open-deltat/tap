import { afterAll, beforeAll, expect, test } from 'bun:test';
import { handleGetAvailability } from '../availability';
import {
	createTestOffer,
	createTestResource,
	createTestTenant,
} from '../../test-setup';

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

test('handleGetAvailability returns error when from/to missing', async () => {
	const result = await handleGetAvailability({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		from: '',
		to: '',
	});

	expect(result.success).toBe(false);
	if (!result.success) {
		expect(result.status).toBe(400);
		expect(result.error).toContain('Missing required query params');
	}
});

test('handleGetAvailability returns error for unknown tenant', async () => {
	const result = await handleGetAvailability({
		tenantSlug: 'unknown-tenant',
		resourceSlug: testResource.slug,
		from: '2025-12-01T10:00:00Z',
		to: '2025-12-01T18:00:00Z',
	});

	expect(result.success).toBe(false);
	if (!result.success) {
		expect(result.status).toBe(404);
		expect(result.error).toBe('Tenant not found');
	}
});

test('handleGetAvailability returns error for unknown resource', async () => {
	const result = await handleGetAvailability({
		tenantSlug: testTenant.slug,
		resourceSlug: 'unknown-resource',
		from: '2025-12-01T10:00:00Z',
		to: '2025-12-01T18:00:00Z',
	});

	expect(result.success).toBe(false);
	if (!result.success) {
		expect(result.status).toBe(404);
		expect(result.error).toBe('Resource not found');
	}
});

test('handleGetAvailability returns slots for available time', async () => {
	const result = await handleGetAvailability({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		from: '2025-12-01T10:00:00Z',
		to: '2025-12-01T18:00:00Z',
		durationMinutes: '60',
	});

	expect(result.success).toBe(true);
	if (result.success) {
		expect(Array.isArray(result.slots)).toBe(true);
		expect(result.slots.length).toBeGreaterThan(0);
		expect(result.slots[0]).toHaveProperty('start');
		expect(result.slots[0]).toHaveProperty('end');
		expect(typeof result.slots[0]?.start).toBe('number');
		expect(typeof result.slots[0]?.end).toBe('number');
	}
});

test('handleGetAvailability returns asOfEventId', async () => {
	const result = await handleGetAvailability({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		from: '2025-12-01T10:00:00Z',
		to: '2025-12-01T18:00:00Z',
	});

	expect(result.success).toBe(true);
	if (result.success) {
		expect(result.asOfEventId).toBeDefined();
	}
});

test('handleGetAvailability handles multiple days', async () => {
	const result = await handleGetAvailability({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		from: '2025-12-01T10:00:00Z',
		to: '2025-12-03T18:00:00Z',
		durationMinutes: '60',
	});

	expect(result.success).toBe(true);
	if (result.success) {
		expect(result.slots.length).toBeGreaterThan(0);
	}
});

test('handleGetAvailability handles invalid date format gracefully', async () => {
	const result = await handleGetAvailability({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		from: 'invalid-date',
		to: '2025-12-01T18:00:00Z',
	});

	expect(result.success).toBe(true);
	if (result.success) {
		expect(Array.isArray(result.slots)).toBe(true);
	}
});

test('handleGetAvailability returns error when range exceeds 35 days', async () => {
	const result = await handleGetAvailability({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		from: '2025-12-01T00:00:00Z',
		to: '2026-02-01T00:00:00Z',
	});

	expect(result.success).toBe(false);
	if (!result.success) {
		expect(result.status).toBe(400);
		expect(result.error).toContain('Date range too large');
	}
});
