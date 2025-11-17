import { expect, test } from 'bun:test';
import { ulid } from 'ulid';
import type { LedgerEvent } from '../domain/events';
import type { HoldId, ResourceId, TenantId } from '../domain/ids';
import { createInMemoryEventStore } from './event-store';

test('append and getAll work correctly', async () => {
	const store = createInMemoryEventStore();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const event: LedgerEvent = {
		eventId: ulid(),
		tenantId,
		resourceId,
		type: 'HoldPlaced',
		version: 1,
		createdAt: Date.now(),
		payload: {
			holdId: ulid() as HoldId,
			day: '2025-12-01',
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60_000,
		},
	};

	await store.append(event);
	const all = await store.getAll();

	expect(all.length).toBe(1);
	expect(all[0]).toEqual(event);
});

test('getByResource filters correctly', async () => {
	const store = createInMemoryEventStore();
	const tenantId = ulid() as TenantId;
	const resourceId1 = ulid() as ResourceId;
	const resourceId2 = ulid() as ResourceId;

	const event1: LedgerEvent = {
		eventId: ulid(),
		tenantId,
		resourceId: resourceId1,
		type: 'HoldPlaced',
		version: 1,
		createdAt: Date.now(),
		payload: {
			holdId: ulid() as HoldId,
			day: '2025-12-01',
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60_000,
		},
	};

	const event2: LedgerEvent = {
		eventId: ulid(),
		tenantId,
		resourceId: resourceId2,
		type: 'HoldPlaced',
		version: 1,
		createdAt: Date.now(),
		payload: {
			holdId: ulid() as HoldId,
			day: '2025-12-01',
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60_000,
		},
	};

	await store.append(event1);
	await store.append(event2);

	const resource1Events = await store.getByResource(tenantId, resourceId1);
	expect(resource1Events.length).toBe(1);
	expect(resource1Events[0]).toEqual(event1);

	const resource2Events = await store.getByResource(tenantId, resourceId2);
	expect(resource2Events.length).toBe(1);
	expect(resource2Events[0]).toEqual(event2);
});

test('getByTenant filters correctly', async () => {
	const store = createInMemoryEventStore();
	const tenantId1 = ulid() as TenantId;
	const tenantId2 = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const event1: LedgerEvent = {
		eventId: ulid(),
		tenantId: tenantId1,
		resourceId,
		type: 'HoldPlaced',
		version: 1,
		createdAt: Date.now(),
		payload: {
			holdId: ulid() as HoldId,
			day: '2025-12-01',
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60_000,
		},
	};

	const event2: LedgerEvent = {
		eventId: ulid(),
		tenantId: tenantId2,
		resourceId,
		type: 'HoldPlaced',
		version: 1,
		createdAt: Date.now(),
		payload: {
			holdId: ulid() as HoldId,
			day: '2025-12-01',
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60_000,
		},
	};

	await store.append(event1);
	await store.append(event2);

	const tenant1Events = await store.getByTenant(tenantId1);
	expect(tenant1Events.length).toBe(1);
	expect(tenant1Events[0]).toEqual(event1);

	const tenant2Events = await store.getByTenant(tenantId2);
	expect(tenant2Events.length).toBe(1);
	expect(tenant2Events[0]).toEqual(event2);
});
