import { expect, test } from 'bun:test';
import { ulid } from 'ulid';
import type { ResourceId, TenantId } from '../../domain/ids';
import { createMutex } from '../../infrastructure/mutex';
import { createExpiryManager } from './expiry-manager';
import { createHoldManager } from './hold-manager';
import { createStateManager } from './state-manager';
import type { HoldMetadata } from './types';

test('expireHolds removes expired holds', async () => {
	const { manager } = createStateManager();
	const holds = new Map<string, HoldMetadata>();
	const withLock = createMutex();
	const holdManager = createHoldManager({
		getState: manager.getState,
		holds,
		withLock,
	});
	const expiryManager = createExpiryManager({
		getState: manager.getState,
		holds,
	});

	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const holdResult = await holdManager.placeHold({
		tenantId,
		resourceId,
		day: '2025-12-25',
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() - 1000,
	});

	expect(holdResult.success).toBeTrue();
	if (!holdResult.success) {
		throw new Error('Hold placement failed');
	}

	const expired = expiryManager.expireHolds(Date.now());

	expect(expired.length).toBeGreaterThan(0);
	expect(expired).toContain(holdResult.holdId);
	expect(holds.has(holdResult.holdId)).toBeFalse();
});

test('expireHolds does not remove non-expired holds', async () => {
	const { manager } = createStateManager();
	const holds = new Map<string, HoldMetadata>();
	const withLock = createMutex();
	const holdManager = createHoldManager({
		getState: manager.getState,
		holds,
		withLock,
	});
	const expiryManager = createExpiryManager({
		getState: manager.getState,
		holds,
	});

	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const holdResult = await holdManager.placeHold({
		tenantId,
		resourceId,
		day: '2025-12-25',
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	expect(holdResult.success).toBeTrue();
	if (!holdResult.success) {
		throw new Error('Hold placement failed');
	}

	const expired = expiryManager.expireHolds(Date.now());

	expect(expired.length).toBe(0);
	expect(holds.has(holdResult.holdId)).toBeTrue();
});
