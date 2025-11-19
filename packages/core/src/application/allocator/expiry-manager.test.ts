import { expect, test } from 'bun:test';
import { ulid } from 'ulid';
import type { HoldId, ResourceId, SessionId, TenantId } from '../../domain/ids';
import { createMutex } from '../../infrastructure/mutex';
import { createExpiryManager } from './expiry-manager';
import { createHoldManager } from './hold-manager';
import { createStateManager } from './state-manager';
import type { HoldMetadata } from './types';

test('expireHolds removes expired holds', async () => {
	const { manager } = createStateManager();
	const holds = new Map<HoldId, HoldMetadata>();
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
	const sessionId = 'sess_01' as SessionId;

	const holdResult = await holdManager.placeHold({
		tenantId,
		resourceId,
		sessionId,
		day: '2025-12-25',
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() - 1000,
	});

	expect(holdResult.success).toBeTrue();
	if (!holdResult.success) {
		throw new Error('Hold placement failed');
	}

	const expiredEvents = expiryManager.expireHolds(Date.now());

	expect(expiredEvents.length).toBeGreaterThan(0);
	expect(expiredEvents.some((e) => e.payload.holdId === holdResult.holdId)).toBeTrue();
	expect(holds.has(holdResult.holdId)).toBeFalse();
});

test('expireHolds does not remove non-expired holds', async () => {
	const { manager } = createStateManager();
	const holds = new Map<HoldId, HoldMetadata>();
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
	const sessionId = 'sess_01' as SessionId;

	const holdResult = await holdManager.placeHold({
		tenantId,
		resourceId,
		sessionId,
		day: '2025-12-25',
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	expect(holdResult.success).toBeTrue();
	if (!holdResult.success) {
		throw new Error('Hold placement failed');
	}

	const expiredEvents = expiryManager.expireHolds(Date.now());

	expect(expiredEvents.length).toBe(0);
	expect(holds.has(holdResult.holdId)).toBeTrue();
});
