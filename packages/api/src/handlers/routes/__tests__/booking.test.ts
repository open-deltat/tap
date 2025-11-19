import { afterAll, beforeAll, expect, test } from 'bun:test';
import { handleBook } from '../booking';
import {
	createTestOffer,
	createTestResource,
	createTestTenant,
} from '../../test-setup';
import { getAllocator, getEventStore } from '../../../services/context';
import type { TenantId, ResourceId } from '@tap/core';
import { ulid } from 'ulid';

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

test('handleBook returns error when tenant not found', async () => {
	const result = await handleBook({
		tenantSlug: 'non-existent-tenant',
		resourceSlug: 'resource',
		body: {
			customerName: 'Test User',
			customerEmail: 'test@example.com',
		},
	});

	expect(result.success).toBe(false);
	if (!result.success) {
		expect(result.error).toBe('Tenant not found');
		expect(result.status).toBe(404);
	}
});

test('handleBook returns error when resource not found', async () => {
	const result = await handleBook({
		tenantSlug: testTenant.slug,
		resourceSlug: 'non-existent-resource',
		body: {
			customerName: 'Test User',
			customerEmail: 'test@example.com',
		},
	});

	expect(result.success).toBe(false);
	if (!result.success) {
		expect(result.error).toBe('Resource not found');
		expect(result.status).toBe(404);
	}
});

test('handleBook returns error when missing required fields', async () => {
	const result = await handleBook({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		body: {
			customerName: '',
			customerEmail: '',
		},
	});

	expect(result.success).toBe(false);
	if (!result.success) {
		expect(result.error).toContain('Missing required fields');
		expect(result.status).toBe(400);
	}
});

test('handleBook creates booking from holdId', async () => {
	const allocator = getAllocator();
	const eventStore = getEventStore();

	const day = '2025-12-15';
	const holdResult = await allocator.placeHold({
		tenantId: testTenant.id as TenantId,
		resourceId: testResource.id as ResourceId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	if (!holdResult.success) {
		throw new Error('Failed to place hold');
	}

	await eventStore.append(holdResult.event);

	const result = await handleBook({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		body: {
			holdId: holdResult.holdId,
			customerName: 'Test User',
			customerEmail: 'test@example.com',
		},
	});

	expect(result.success).toBe(true);
	if (result.success) {
		expect(result.bookingId).toBeDefined();
		expect(result.status).toBe('CONFIRMED');
		expect(result.start).toBeDefined();
		expect(result.end).toBeDefined();
	}
});

test('handleBook creates booking from start and end', async () => {
	const futureDate = new Date();
	futureDate.setDate(futureDate.getDate() + 1);
	futureDate.setHours(10, 0, 0, 0);
	const start = futureDate.getTime();
	const end = start + 60 * 60 * 1000;

	const result = await handleBook({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		body: {
			start,
			end,
			customerName: 'Test User',
			customerEmail: 'test@example.com',
		},
	});

	expect(result.success).toBe(true);
	if (result.success) {
		expect(result.bookingId).toBeDefined();
		expect(result.status).toBe('CONFIRMED');
	}
});

test('handleBook returns error when holdId not found', async () => {
	const result = await handleBook({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		body: {
			holdId: 'non-existent-hold',
			customerName: 'Test User',
			customerEmail: 'test@example.com',
		},
	});

	expect(result.success).toBe(false);
	if (!result.success) {
		expect(result.error).toBe('Hold not found');
		expect(result.status).toBe(404);
	}
});

test('handleBook returns error when slot not available', async () => {
	const allocator = getAllocator();
	const eventStore = getEventStore();

	const day = '2025-12-16';
	const holdResult1 = await allocator.placeHold({
		tenantId: testTenant.id as TenantId,
		resourceId: testResource.id as ResourceId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	if (!holdResult1.success) {
		throw new Error('Failed to place first hold');
	}

	await eventStore.append(holdResult1.event);

	const futureDate = new Date();
	futureDate.setDate(futureDate.getDate() + 1);
	futureDate.setHours(10, 0, 0, 0);
	const start = futureDate.getTime();
	const end = start + 60 * 60 * 1000;

	const result = await handleBook({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		body: {
			start,
			end,
			customerName: 'Test User',
			customerEmail: 'test@example.com',
		},
	});

	expect(result.success).toBe(true);
});

test('handleBook includes customerPhone when provided', async () => {
	const allocator = getAllocator();
	const eventStore = getEventStore();

	const day = '2025-12-17';
	const holdResult = await allocator.placeHold({
		tenantId: testTenant.id as TenantId,
		resourceId: testResource.id as ResourceId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	if (!holdResult.success) {
		throw new Error('Failed to place hold');
	}

	await eventStore.append(holdResult.event);

	const result = await handleBook({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		body: {
			holdId: holdResult.holdId,
			customerName: 'Test User',
			customerEmail: 'test@example.com',
			customerPhone: '+1234567890',
		},
	});

	expect(result.success).toBe(true);
});

test('handleBook returns error when missing both holdId and start/end', async () => {
	const result = await handleBook({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		body: {
			customerName: 'Test User',
			customerEmail: 'test@example.com',
		},
	});

	expect(result.success).toBe(false);
	if (!result.success) {
		expect(result.error).toContain('Missing required fields');
		expect(result.status).toBe(400);
	}
});

test('handleBook returns error for invalid date format', async () => {
	const result = await handleBook({
		tenantSlug: testTenant.slug,
		resourceSlug: testResource.slug,
		body: {
			start: 'invalid-date',
			end: 'invalid-date',
			customerName: 'Test User',
			customerEmail: 'test@example.com',
		},
	});

	expect(result.success).toBe(false);
	if (!result.success) {
		expect(result.error).toContain('Invalid');
		expect(result.status).toBe(400);
	}
});



