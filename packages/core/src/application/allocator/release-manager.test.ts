import { expect, test } from 'bun:test';
import { ulid } from 'ulid';
import type { ResourceId, TenantId } from '../../domain/ids';
import { createReleaseManager } from './release-manager';
import { createStateManager } from './state-manager';

test('releaseHold removes hold from map and clears bits', async () => {
	const { manager } = createStateManager();
	const holds = new Map();

	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const holdId = ulid();

	const day = '2025-12-01';
	const startMinute = 600;
	const endMinute = 660;

	holds.set(holdId, {
		tenantId,
		resourceId,
		day,
		start: startMinute,
		end: endMinute,
		expiresAt: Date.now() + 60_000,
	});

	const state = manager.getState(tenantId, resourceId);
	const { createBitmapDay, setBitRange } = await import(
		'../../infrastructure/bitmap'
	);
	const dayState = createBitmapDay(15);
	setBitRange(dayState.held, startMinute, endMinute, true);
	state.set(day, dayState);

	const releaseManager = createReleaseManager({
		getState: manager.getState,
		holds,
	});

	const event = await releaseManager.releaseHold({
		holdId,
		tenantId,
		resourceId,
	});

	expect(event).toBeDefined();
	expect(event?.type).toBe('HoldExpired');
	expect(event?.payload.holdId).toBe(holdId);
	expect(holds.has(holdId)).toBe(false);

	const updatedDayState = state.get(day);
	expect(updatedDayState).toBeDefined();
	if (updatedDayState) {
		for (let m = startMinute; m < endMinute; m++) {
			const byte = m >> 3;
			const bit = m & 7;
			const heldByte = updatedDayState.held[byte];
			expect((heldByte & (1 << bit)) === 0).toBe(true);
		}
	}
});

test('releaseHold returns null for non-existent hold', async () => {
	const { manager } = createStateManager();
	const holds = new Map();

	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const holdId = ulid();

	const releaseManager = createReleaseManager({
		getState: manager.getState,
		holds,
	});

	const event = await releaseManager.releaseHold({
		holdId,
		tenantId,
		resourceId,
	});

	expect(event).toBeNull();
});

test('releaseHold returns null for wrong tenant/resource', async () => {
	const { manager } = createStateManager();
	const holds = new Map();

	const tenantId1 = ulid() as TenantId;
	const tenantId2 = ulid() as TenantId;
	const resourceId1 = ulid() as ResourceId;
	const resourceId2 = ulid() as ResourceId;
	const holdId = ulid();

	holds.set(holdId, {
		tenantId: tenantId1,
		resourceId: resourceId1,
		day: '2025-12-01',
		start: 600,
		end: 660,
		expiresAt: Date.now() + 60_000,
	});

	const releaseManager = createReleaseManager({
		getState: manager.getState,
		holds,
	});

	const event = await releaseManager.releaseHold({
		holdId,
		tenantId: tenantId2,
		resourceId: resourceId2,
	});

	expect(event).toBeNull();
	expect(holds.has(holdId)).toBe(true);
});
