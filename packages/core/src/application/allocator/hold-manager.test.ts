import { expect, test } from 'bun:test';
import { ulid } from 'ulid';
import type { HoldId, ResourceId, SessionId, TenantId } from '../../domain/ids';
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
	const sessionId = 'sess_01' as SessionId;

	const result = await holdManager.placeHold({
		tenantId,
		resourceId,
		sessionId,
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
	const sessionId = 'sess_01' as SessionId;

	const first = await holdManager.placeHold({
		tenantId,
		resourceId,
		sessionId,
		day: '2025-12-25',
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	expect(first.success).toBeTrue();

	const second = await holdManager.placeHold({
		tenantId,
		resourceId,
		sessionId,
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
	const sessionId = 'sess_01' as SessionId;
	const day = '2025-12-25';

	await holdManager.placeHold({
		tenantId,
		resourceId,
		sessionId,
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

test('releaseHoldsForSession releases all holds for session', async () => {
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
	const sessionA = 'sess_A' as SessionId;
	const sessionB = 'sess_B' as SessionId;
	const day = '2025-12-25';

	// Place two holds for session A
	await holdManager.placeHold({
		tenantId,
		resourceId,
		sessionId: sessionA,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});
	await holdManager.placeHold({
		tenantId,
		resourceId,
		sessionId: sessionA,
		day,
		startMinute: 660,
		endMinute: 720,
		expiresAt: Date.now() + 60_000,
	});

	// Place one hold for session B
	const holdB = await holdManager.placeHold({
		tenantId,
		resourceId,
		sessionId: sessionB,
		day,
		startMinute: 720,
		endMinute: 780,
		expiresAt: Date.now() + 60_000,
	});

	expect(holds.size).toBe(3);

	const released = await holdManager.releaseHoldsForSession(sessionA);

	expect(released.length).toBe(2);
	expect(released.every(e => e.type === 'HoldExpired')).toBeTrue();

	expect(holds.size).toBe(1);
	if (holdB.success) {
		expect(holds.has(holdB.holdId)).toBeTrue();
	}
});
