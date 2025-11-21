import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
	createTestOffer,
	createTestResource,
	createTestTenant,
} from '../../test-setup';
import { handlePlaceHold, handleReleaseHold } from '../hold';

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

test('handlePlaceHold returns error for unknown tenant', async () => {
	const result = await handlePlaceHold({
		tenantSlug: 'unknown-tenant',
		resourceSlug: testResource.slug,
		start: '2025-12-01T10:00:00Z',
		end: '2025-12-01T11:00:00Z',
	});

	expect(result.success).toBe(false);
	if (!result.success) {
		expect(result.status).toBe(404);
		expect(result.error).toBe('Tenant not found');
	}
});

test('returns error for unknown resource', async () => {
	const result = await handlePlaceHold({
		tenantSlug: testTenant.slug,
		resourceSlug: 'unknown-resource',
		start: '2025-12-01T10:00:00Z',
		end: '2025-12-01T11:00:00Z',
	});

	expect(result.success).toBe(false);
	if (!result.success) {
		expect(result.status).toBe(404);
		expect(result.error).toBe('Resource not found');
	}
});

test('handlePlaceHold returns error for invalid date format', async () => {
	const result = await handlePlaceHold({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		start: 'invalid-date',
		end: '2025-12-01T11:00:00Z',
	});

	expect(result.success).toBe(false);
	if (!result.success) {
		expect(result.status).toBe(400);
		expect(result.error).toContain('Invalid');
	}
});

test('handlePlaceHold returns error when slot exceeds horizon', async () => {
	const result = await handlePlaceHold({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		start: '2026-06-01T10:00:00Z',
		end: '2026-06-01T11:00:00Z',
	});

	expect(result.success).toBe(false);
	if (!result.success) {
		expect(result.status).toBe(400);
		expect(result.error).toContain('horizon');
	}
});

test('handlePlaceHold places hold successfully', async () => {
	const result = await handlePlaceHold({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		start: '2025-12-01T10:00:00Z',
		end: '2025-12-01T11:00:00Z',
	});

	expect(result.success).toBe(true);
	if (result.success) {
		expect(result.holdId).toBeDefined();
		expect(typeof result.holdId).toBe('string');
		expect(result.expiresAt).toBeGreaterThan(Date.now());
	}
});

test('handlePlaceHold places hold with unix timestamp', async () => {
	const start = new Date('2025-12-02T10:00:00Z').getTime();
	const end = new Date('2025-12-02T11:00:00Z').getTime();

	const result = await handlePlaceHold({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		start,
		end,
	});

	expect(result.success).toBe(true);
	if (result.success) {
		expect(result.holdId).toBeDefined();
	}
});

test('handlePlaceHold places hold with clientRef', async () => {
	const result = await handlePlaceHold({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		start: '2025-12-03T10:00:00Z',
		end: '2025-12-03T11:00:00Z',
		clientRef: 'test-ref-123',
	});

	expect(result.success).toBe(true);
	if (result.success) {
		expect(result.holdId).toBeDefined();
	}
});

test('handlePlaceHold returns error when slot is already held', async () => {
	const firstResult = await handlePlaceHold({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		start: '2025-12-04T10:00:00Z',
		end: '2025-12-04T11:00:00Z',
	});

	expect(firstResult.success).toBe(true);

	const secondResult = await handlePlaceHold({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		start: '2025-12-04T10:00:00Z',
		end: '2025-12-04T11:00:00Z',
	});

	expect(secondResult.success).toBe(false);
	if (!secondResult.success) {
		expect(secondResult.status).toBe(409);
		expect(secondResult.error).toBe('Slot not available');
	}
});

test('handleReleaseHold returns error for unknown tenant', async () => {
	const result = await handleReleaseHold({
		tenantSlug: 'unknown-tenant',
		resourceSlug: testResource.slug,
		holdId: 'hold_123',
	});

	expect(result.success).toBe(false);
	if (!result.success) {
		expect(result.status).toBe(404);
		expect(result.error).toBe('Tenant not found');
	}
});

test('returns error for unknown resource', async () => {
	const result = await handleReleaseHold({
		tenantSlug: testTenant.slug,
		resourceSlug: 'unknown-resource',
		holdId: 'hold_123',
	});

	expect(result.success).toBe(false);
	if (!result.success) {
		expect(result.status).toBe(404);
		expect(result.error).toBe('Resource not found');
	}
});

test('handleReleaseHold returns error for non-existent hold', async () => {
	const result = await handleReleaseHold({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		holdId: 'hold_nonexistent',
	});

	expect(result.success).toBe(false);
	if (!result.success) {
		expect(result.status).toBe(404);
		expect(result.error).toBe('Hold not found or access denied');
	}
});

test('handleReleaseHold releases hold successfully', async () => {
	const placeResult = await handlePlaceHold({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		start: '2025-12-05T10:00:00Z',
		end: '2025-12-05T11:00:00Z',
	});

	expect(placeResult.success).toBe(true);
	if (!placeResult.success) {
		throw new Error('Failed to place hold');
	}

	const releaseResult = await handleReleaseHold({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		holdId: placeResult.holdId,
	});

	expect(releaseResult.success).toBe(true);
	if (releaseResult.success) {
		expect(releaseResult.released).toBe(true);
	}
});

test('handleReleaseHold allows placing hold again after release', async () => {
	const placeResult = await handlePlaceHold({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		start: '2025-12-06T10:00:00Z',
		end: '2025-12-06T11:00:00Z',
	});

	expect(placeResult.success).toBe(true);
	if (!placeResult.success) {
		throw new Error('Failed to place hold');
	}

	const releaseResult = await handleReleaseHold({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		holdId: placeResult.holdId,
	});

	expect(releaseResult.success).toBe(true);

	const placeAgainResult = await handlePlaceHold({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		start: '2025-12-06T10:00:00Z',
		end: '2025-12-06T11:00:00Z',
	});

	expect(placeAgainResult.success).toBe(true);
});
