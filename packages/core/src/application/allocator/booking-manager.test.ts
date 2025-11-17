import { expect, test } from 'bun:test';
import { ulid } from 'ulid';
import type { BookingId, HoldId, ResourceId, TenantId } from '../../domain/ids';
import { createMutex } from '../../infrastructure/mutex';
import { createBookingManager } from './booking-manager';
import { createHoldManager } from './hold-manager';
import { createStateManager } from './state-manager';
import type { HoldMetadata } from './types';

test('confirmBooking succeeds when hold exists', async () => {
	const { manager } = createStateManager();
	const holds = new Map<HoldId, HoldMetadata>();
	const withLock = createMutex();
	const holdManager = createHoldManager({
		getState: manager.getState,
		holds,
		withLock,
	});
	const bookingManager = createBookingManager({
		getState: manager.getState,
		holds,
		withLock,
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

	const dayStart = new Date('2025-12-25').setHours(0, 0, 0, 0);
	const start = dayStart + 600 * 60 * 1000;
	const end = dayStart + 660 * 60 * 1000;

	const bookingResult = await bookingManager.confirmBooking({
		tenantId,
		resourceId,
		holdId: holdResult.holdId,
		bookingId: ulid() as BookingId,
		start,
		end,
	});

	expect(bookingResult).not.toBeNull();
	if (bookingResult) {
		expect(bookingResult.type).toBe('BookingConfirmed');
		expect(holds.has(holdResult.holdId)).toBeFalse();
	}
});

test('confirmBooking returns null when hold does not exist', async () => {
	const { manager } = createStateManager();
	const holds = new Map<HoldId, HoldMetadata>();
	const withLock = createMutex();
	const bookingManager = createBookingManager({
		getState: manager.getState,
		holds,
		withLock,
	});

	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const dayStart = new Date('2025-12-25').setHours(0, 0, 0, 0);
	const start = dayStart + 600 * 60 * 1000;
	const end = dayStart + 660 * 60 * 1000;

	const result = await bookingManager.confirmBooking({
		tenantId,
		resourceId,
		holdId: ulid() as HoldId,
		bookingId: ulid() as BookingId,
		start,
		end,
	});

	expect(result).toBeNull();
});
