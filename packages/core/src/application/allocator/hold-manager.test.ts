import { expect, test } from 'bun:test';
import { ulid } from 'ulid';
import type { HoldId, ResourceId, TenantId } from '../../domain/ids';
import { createMutex } from '../../infrastructure/mutex';
import { createHoldManager } from './hold-manager';
import { createStateManager } from './state-manager';
import type { HoldMetadata } from './types';

test('placeHold succeeds when range is free', async () => {
	const { manager } = createStateManager();
	const holds = new Map<HoldId, HoldMetadata>();
	const withLock = createMutex();
	const holdManager = createHoldManager({
		getState: manager.getState,
		holds,
		withLock,
	});

	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const result = await holdManager.placeHold({
		tenantId,
		resourceId,
		day: '2025-12-25',
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	expect(result.success).toBeTrue();
	if (result.success) {
		expect(result.holdId).toBeDefined();
		expect(result.event.type).toBe('HoldPlaced');
		expect(holds.has(result.holdId)).toBeTrue();
	}
});

test('placeHold fails when range is not free', async () => {
	const { manager } = createStateManager();
	const holds = new Map<HoldId, HoldMetadata>();
	const withLock = createMutex();
	const holdManager = createHoldManager({
		getState: manager.getState,
		holds,
		withLock,
	});

	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const first = await holdManager.placeHold({
		tenantId,
		resourceId,
		day: '2025-12-25',
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	expect(first.success).toBeTrue();

	const second = await holdManager.placeHold({
		tenantId,
		resourceId,
		day: '2025-12-25',
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	expect(second.success).toBeFalse();
});

test('placeHold creates bitmap day if not exists', async () => {
	const { manager } = createStateManager();
	const holds = new Map<HoldId, HoldMetadata>();
	const withLock = createMutex();
	const holdManager = createHoldManager({
		getState: manager.getState,
		holds,
		withLock,
	});

	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-25';

	await holdManager.placeHold({
		tenantId,
		resourceId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	const state = manager.getState(tenantId, resourceId);
	const dayState = state.get(day);

	expect(dayState).toBeDefined();
	if (dayState) {
		expect(dayState.booked.length).toBe(180);
		expect(dayState.held.length).toBe(180);
	}
});
