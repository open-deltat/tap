import { expect, test } from 'bun:test';
import { ulid } from 'ulid';
import type { BookingId, HoldId, ResourceId, TenantId } from '../../domain/ids';
import { parseDayToUnixStartOfDayUTC } from '../../infrastructure/day-utils';
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

	const dayStart = parseDayToUnixStartOfDayUTC('2025-12-25');
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

	const dayStart = parseDayToUnixStartOfDayUTC('2025-12-25');
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

test('cancelBooking succeeds when booking exists', async () => {
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
	const day = '2025-12-25';

	// Place and confirm a booking
	const holdResult = await holdManager.placeHold({
		tenantId,
		resourceId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	expect(holdResult.success).toBeTrue();
	if (!holdResult.success) {
		throw new Error('Hold placement failed');
	}

	const dayStart = parseDayToUnixStartOfDayUTC(day);
	const start = dayStart + 600 * 60 * 1000;
	const end = dayStart + 660 * 60 * 1000;

	const bookingId = ulid() as BookingId;
	const confirmResult = await bookingManager.confirmBooking({
		tenantId,
		resourceId,
		holdId: holdResult.holdId,
		bookingId,
		start,
		end,
	});

	expect(confirmResult).not.toBeNull();

	// Verify bits are set
	const state = manager.getState(tenantId, resourceId);
	const dayState = state.get(day);
	expect(dayState).toBeDefined();
	if (dayState) {
		// Check that bits are booked
		const bookedBits = [];
		for (let m = 600; m < 660; m++) {
			const byte = m >> 3;
			const bit = m & 7;
			const bookedByte = dayState.booked[byte];
			if (bookedByte !== undefined && (bookedByte & (1 << bit)) !== 0) {
				bookedBits.push(m);
			}
		}
		expect(bookedBits.length).toBeGreaterThan(0);
	}

	// Cancel the booking
	const cancelResult = await bookingManager.cancelBooking({
		tenantId,
		resourceId,
		bookingId,
		day,
		startMinute: 600,
		endMinute: 660,
	});

	expect(cancelResult).not.toBeNull();
	if (cancelResult) {
		expect(cancelResult.type).toBe('BookingCancelled');
		expect(cancelResult.payload.bookingId).toBe(bookingId);
	}

	// Verify bits are cleared
	const stateAfter = manager.getState(tenantId, resourceId);
	const dayStateAfter = stateAfter.get(day);
	expect(dayStateAfter).toBeDefined();
	if (dayStateAfter) {
		// Check that bits are no longer booked
		const bookedBitsAfter = [];
		for (let m = 600; m < 660; m++) {
			const byte = m >> 3;
			const bit = m & 7;
			const bookedByte = dayStateAfter.booked[byte];
			if (bookedByte !== undefined && (bookedByte & (1 << bit)) !== 0) {
				bookedBitsAfter.push(m);
			}
		}
		expect(bookedBitsAfter.length).toBe(0);
	}
});

test('cancelBooking returns null when booking does not exist', async () => {
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

	const result = await bookingManager.cancelBooking({
		tenantId,
		resourceId,
		bookingId: ulid() as BookingId,
		day: '2025-12-25',
		startMinute: 600,
		endMinute: 660,
	});

	expect(result).toBeNull();
});

test('cancelBooking returns null when day state does not exist', async () => {
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

	const result = await bookingManager.cancelBooking({
		tenantId,
		resourceId,
		bookingId: ulid() as BookingId,
		day: '2025-12-25',
		startMinute: 600,
		endMinute: 660,
	});

	expect(result).toBeNull();
});

test('cancelBooking returns null when booking partially exists', async () => {
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
	const day = '2025-12-25';

	// Place and confirm a booking for 600-660
	const holdResult = await holdManager.placeHold({
		tenantId,
		resourceId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	expect(holdResult.success).toBeTrue();
	if (!holdResult.success) {
		throw new Error('Hold placement failed');
	}

	const dayStart = parseDayToUnixStartOfDayUTC(day);
	const start = dayStart + 600 * 60 * 1000;
	const end = dayStart + 660 * 60 * 1000;

	const bookingId = ulid() as BookingId;
	const confirmResult = await bookingManager.confirmBooking({
		tenantId,
		resourceId,
		holdId: holdResult.holdId,
		bookingId,
		start,
		end,
	});

	expect(confirmResult).not.toBeNull();

	// Try to cancel a different range (should fail)
	const cancelResult = await bookingManager.cancelBooking({
		tenantId,
		resourceId,
		bookingId,
		day,
		startMinute: 700, // Different range
		endMinute: 760,
	});

	expect(cancelResult).toBeNull();
});
