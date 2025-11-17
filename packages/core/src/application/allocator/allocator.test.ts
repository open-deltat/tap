import { expect, test } from 'bun:test';
import { ulid } from 'ulid';
import type { BookingId, ResourceId, TenantId } from '../../domain/ids';
import { createAllocator } from './allocator';

test('concurrent hold requests → only one wins', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-25';

	const [a, b] = await Promise.all([
		allocator.placeHold({
			tenantId,
			resourceId,
			day,
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60_000,
		}),
		allocator.placeHold({
			tenantId,
			resourceId,
			day,
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60_000,
		}),
	]);

	const successes = [a, b].filter((r) => r.success).length;
	expect(successes).toBe(1);
});

test('hold → confirm is atomic', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-25';

	const holdResult = await allocator.placeHold({
		tenantId,
		resourceId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	if (!holdResult.success) {
		throw new Error('Hold placement failed');
	}

	const dayStart = new Date(day).setHours(0, 0, 0, 0);
	const start = dayStart + 600 * 60 * 1000;
	const end = dayStart + 660 * 60 * 1000;

	const confirmEvent = await allocator.confirmBooking({
		tenantId,
		resourceId,
		holdId: holdResult.holdId,
		bookingId: ulid() as BookingId,
		start,
		end,
	});

	expect(confirmEvent).not.toBeNull();
	if (confirmEvent) {
		expect(confirmEvent.type).toBe('BookingConfirmed');
	}
});

test('cannot double-book same slot', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-01';

	const [result1, result2] = await Promise.all([
		allocator.placeHold({
			tenantId,
			resourceId,
			day,
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60_000,
		}),
		allocator.placeHold({
			tenantId,
			resourceId,
			day,
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60_000,
		}),
	]);

	const successCount = [result1, result2].filter((r) => r.success).length;
	expect(successCount).toBe(1);
});

test('overlapping holds are rejected', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-01';

	const first = await allocator.placeHold({
		tenantId,
		resourceId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	expect(first.success).toBeTrue();

	const overlapping = await allocator.placeHold({
		tenantId,
		resourceId,
		day,
		startMinute: 630,
		endMinute: 690,
		expiresAt: Date.now() + 60_000,
	});

	expect(overlapping.success).toBeFalse();
});

test('non-overlapping holds are allowed', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-01';

	const first = await allocator.placeHold({
		tenantId,
		resourceId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	expect(first.success).toBeTrue();

	const second = await allocator.placeHold({
		tenantId,
		resourceId,
		day,
		startMinute: 660,
		endMinute: 720,
		expiresAt: Date.now() + 60_000,
	});

	expect(second.success).toBeTrue();
});

test('expired holds are cleaned up', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-01';

	await allocator.placeHold({
		tenantId,
		resourceId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() - 1000,
	});

	const expired = allocator.expireHolds(Date.now());
	expect(expired.length).toBeGreaterThan(0);
});

test('cancelBooking clears booked bits', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-01';

	// Place and confirm a booking
	const holdResult = await allocator.placeHold({
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

	const dayStart = new Date(day).setHours(0, 0, 0, 0);
	const start = dayStart + 600 * 60 * 1000;
	const end = dayStart + 660 * 60 * 1000;

	const bookingId = ulid() as BookingId;
	const confirmResult = await allocator.confirmBooking({
		tenantId,
		resourceId,
		holdId: holdResult.holdId,
		bookingId,
		start,
		end,
	});

	expect(confirmResult).not.toBeNull();

	// Verify state is booked
	const state = allocator.getState(tenantId, resourceId);
	const dayState = state.get(day);
	expect(dayState).toBeDefined();

	// Cancel the booking
	const cancelResult = await allocator.cancelBooking({
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

	// Verify state is cleared
	const stateAfter = allocator.getState(tenantId, resourceId);
	const dayStateAfter = stateAfter.get(day);
	expect(dayStateAfter).toBeDefined();
	if (dayStateAfter) {
		// Check that booked bits are cleared
		const bookedBits = [];
		for (let m = 600; m < 660; m++) {
			const byte = m >> 3;
			const bit = m & 7;
			const bookedByte = dayStateAfter.booked[byte];
			if (bookedByte !== undefined && (bookedByte & (1 << bit)) !== 0) {
				bookedBits.push(m);
			}
		}
		expect(bookedBits.length).toBe(0);
	}
});

test('cancelBooking returns null when booking does not exist', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const result = await allocator.cancelBooking({
		tenantId,
		resourceId,
		bookingId: ulid() as BookingId,
		day: '2025-12-01',
		startMinute: 600,
		endMinute: 660,
	});

	expect(result).toBeNull();
});
