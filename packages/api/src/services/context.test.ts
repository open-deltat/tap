import { expect, test } from 'bun:test';
import type { Resource } from '@tap/core';
import { ulid } from 'ulid';
import {
	getAllocator,
	getEventStore,
	initializeContext,
	resourceRepository,
	tenantRepository,
	validateHorizon,
} from './context';

test('initializeContext loads events and replays state', async () => {
	await initializeContext();
	const allocator = getAllocator();
	const eventStore = getEventStore();

	expect(allocator).toBeDefined();
	expect(eventStore).toBeDefined();
});

test('validateHorizon returns valid for date within horizon', () => {
	const resource: Resource = {
		id: ulid(),
		tenantId: ulid(),
		name: 'Test Resource',
		slug: 'test-resource',
		timezone: 'UTC',
		slotMinutes: '15',
		horizonDays: 90,
		requiresPayment: false,
	};

	const today = new Date();
	const day = today.toISOString().split('T')[0] || '';
	const result = validateHorizon(day, resource);
	expect(result.valid).toBe(true);
});

test('validateHorizon returns invalid for date beyond horizon', () => {
	const resource: Resource = {
		id: ulid(),
		tenantId: ulid(),
		name: 'Test Resource',
		slug: 'test-resource',
		timezone: 'UTC',
		slotMinutes: '15',
		horizonDays: 90,
		requiresPayment: false,
	};

	const future = new Date();
	future.setDate(future.getDate() + 100);
	const day = future.toISOString().split('T')[0] || '';
	const result = validateHorizon(day, resource);
	expect(result.valid).toBe(false);
	expect(result.error).toContain('horizon');
});

test('validateHorizon returns invalid for past dates', () => {
	const resource: Resource = {
		id: ulid(),
		tenantId: ulid(),
		name: 'Test Resource',
		slug: 'test-resource',
		timezone: 'UTC',
		slotMinutes: '15',
		horizonDays: 90,
		requiresPayment: false,
	};

	const past = new Date();
	past.setDate(past.getDate() - 1);
	const day = past.toISOString().split('T')[0] || '';
	const result = validateHorizon(day, resource);
	expect(result.valid).toBe(false);
});

test('getAllocator returns same instance', () => {
	const allocator1 = getAllocator();
	const allocator2 = getAllocator();
	expect(allocator1).toBe(allocator2);
});

test('getEventStore returns same instance', () => {
	const eventStore1 = getEventStore();
	const eventStore2 = getEventStore();
	expect(eventStore1).toBe(eventStore2);
});

test('repositories are initialized', () => {
	expect(tenantRepository).toBeDefined();
	expect(resourceRepository).toBeDefined();
});
