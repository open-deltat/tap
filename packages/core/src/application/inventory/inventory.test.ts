import { expect, test } from 'bun:test';
import { ulid } from 'ulid';
import type {
	BookingId,
	ResourceId,
	SessionId,
	TenantId,
} from '../../domain/ids';
import { parseDayToUnixStartOfDayUTC } from '../../infrastructure/day-utils';
import { createInventory } from './inventory';

test('concurrent hold requests → only one wins', async () => {
	const inventory = createInventory();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const sessionId = 'sess_01' as SessionId;
	const day = '2025-12-25';

	const [a, b] = await Promise.all([
		inventory.placeHold({
			tenantId,
			resourceId,
			sessionId,
			day,
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60_000,
		}),
		inventory.placeHold({
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
	const inventory = createInventory();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const sessionId = 'sess_01' as SessionId;
	const day = '2025-12-25';

	const holdResult = await inventory.placeHold({
		tenantId,
		resourceId,
		sessionId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	if (!holdResult.success) {
		throw new Error('Hold placement failed');
	}

	const dayStart = parseDayToUnixStartOfDayUTC(day);
	const start = dayStart + 600 * 60 * 1000;
	const end = dayStart + 660 * 60 * 1000;

	const confirmEvent = await inventory.confirmBooking({
		tenantId,
		resourceId,
		holdId: holdResult.holdId,
		sessionId,
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
	const inventory = createInventory();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const sessionId = 'sess_01' as SessionId;
	const day = '2025-12-01';

	const [result1, result2] = await Promise.all([
		inventory.placeHold({
			tenantId,
			resourceId,
			sessionId,
			day,
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60_000,
		}),
		inventory.placeHold({
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
	const inventory = createInventory();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const sessionId = 'sess_01' as SessionId;
	const day = '2025-12-01';

	const first = await inventory.placeHold({
		tenantId,
		resourceId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	expect(first.success).toBeTrue();

	const overlapping = await inventory.placeHold({
		tenantId,
		resourceId,
		sessionId,
		day,
		startMinute: 630,
		endMinute: 690,
		expiresAt: Date.now() + 60_000,
	});

	expect(overlapping.success).toBeFalse();
});

test('non-overlapping holds are allowed', async () => {
	const inventory = createInventory();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const sessionId = 'sess_01' as SessionId;
	const day = '2025-12-01';

	const first = await inventory.placeHold({
		tenantId,
		resourceId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	expect(first.success).toBeTrue();

	const second = await inventory.placeHold({
		tenantId,
		resourceId,
		sessionId,
		day,
		startMinute: 660,
		endMinute: 720,
		expiresAt: Date.now() + 60_000,
	});

	expect(second.success).toBeTrue();
});

test('expired holds are cleaned up', async () => {
	const inventory = createInventory();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const sessionId = 'sess_01' as SessionId;
	const day = '2025-12-01';

	await inventory.placeHold({
		tenantId,
		resourceId,
		sessionId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() - 1000,
	});

	const expired = inventory.expireHolds(Date.now());
	expect(expired.length).toBeGreaterThan(0);
});

test('cancelBooking clears booked bits', async () => {
	const inventory = createInventory();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const sessionId = 'sess_01' as SessionId;
	const day = '2025-12-01';

	// Place and confirm a booking
	const holdResult = await inventory.placeHold({
		tenantId,
		resourceId,
		sessionId,
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
	const confirmResult = await inventory.confirmBooking({
		tenantId,
		resourceId,
		holdId: holdResult.holdId,
		sessionId,
		bookingId,
		start,
		end,
	});

	expect(confirmResult).not.toBeNull();

	// Verify state is booked
	const state = inventory.getState(tenantId, resourceId);
	const dayState = state.get(day);
	expect(dayState).toBeDefined();

	// Cancel the booking
	const cancelResult = await inventory.cancelBooking({
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
	const stateAfter = inventory.getState(tenantId, resourceId);
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
	const inventory = createInventory();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const result = await inventory.cancelBooking({
		tenantId,
		resourceId,
		bookingId: ulid() as BookingId,
		day: '2025-12-01',
		startMinute: 600,
		endMinute: 660,
	});

	expect(result).toBeNull();
});

test('placeHold uses unix timestamps for expiresAt', async () => {
	const inventory = createInventory();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const sessionId = 'sess_01' as SessionId;
	const day = '2025-12-25';

	const unixTimestamp = 1735084800000;
	const expiresAt = unixTimestamp + 60_000;

	const result = await inventory.placeHold({
		tenantId,
		resourceId,
		sessionId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt,
	});

	expect(result.success).toBeTrue();
	if (result.success) {
		expect(result.event.payload.expiresAt).toBe(expiresAt);
		expect(typeof result.event.payload.expiresAt).toBe('number');
		expect(result.event.createdAt).toBeGreaterThan(0);
		expect(typeof result.event.createdAt).toBe('number');
	}
});

test('confirmBooking uses unix timestamps for start and end', async () => {
	const inventory = createInventory();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const sessionId = 'sess_01' as SessionId;
	const day = '2025-12-25';

	const dayStartUnix = parseDayToUnixStartOfDayUTC(day);
	const holdResult = await inventory.placeHold({
		tenantId,
		resourceId,
		sessionId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: dayStartUnix + 60_000,
	});

	if (!holdResult.success) {
		throw new Error('Hold placement failed');
	}

	const unixStart = dayStartUnix + 600 * 60 * 1000;
	const unixEnd = dayStartUnix + 660 * 60 * 1000;

	const confirmEvent = await inventory.confirmBooking({
		tenantId,
		resourceId,
		holdId: holdResult.holdId,
		sessionId,
		bookingId: ulid() as BookingId,
		start: unixStart,
		end: unixEnd,
	});

	expect(confirmEvent).not.toBeNull();
	if (confirmEvent) {
		expect(confirmEvent.type).toBe('BookingConfirmed');
		expect(confirmEvent.payload.start).toBe(unixStart);
		expect(confirmEvent.payload.end).toBe(unixEnd);
		expect(typeof confirmEvent.payload.start).toBe('number');
		expect(typeof confirmEvent.payload.end).toBe('number');
		expect(confirmEvent.createdAt).toBeGreaterThan(0);
		expect(typeof confirmEvent.createdAt).toBe('number');
	}
});

test('expireHolds uses unix timestamps', async () => {
	const inventory = createInventory();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const sessionId = 'sess_01' as SessionId;
	const day = '2025-12-01';

	const pastUnixTimestamp = 1735084800000 - 1000;
	const futureUnixTimestamp = 1735084800000 + 1000;

	await inventory.placeHold({
		tenantId,
		resourceId,
		sessionId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: pastUnixTimestamp,
	});

	await inventory.placeHold({
		tenantId,
		resourceId,
		sessionId,
		day,
		startMinute: 660,
		endMinute: 720,
		expiresAt: futureUnixTimestamp,
	});

	const expired = inventory.expireHolds(1735084800000);
	expect(expired.length).toBe(1);
});

test('all timestamps are unix milliseconds (timezone-agnostic)', async () => {
	const inventory = createInventory();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const sessionId = 'sess_01' as SessionId;
	const day = '2025-12-25';

	const dayStartUnix = parseDayToUnixStartOfDayUTC(day);
	const unixExpiresAt = dayStartUnix + 60_000;

	const holdResult = await inventory.placeHold({
		tenantId,
		resourceId,
		sessionId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: unixExpiresAt,
	});

	expect(holdResult.success).toBeTrue();
	if (holdResult.success) {
		const event = holdResult.event;
		expect(event.createdAt).toBeGreaterThan(0);
		expect(event.payload.expiresAt).toBe(unixExpiresAt);

		const unixStart = dayStartUnix + 600 * 60 * 1000;
		const unixEnd = dayStartUnix + 660 * 60 * 1000;

		const confirmEvent = await inventory.confirmBooking({
			tenantId,
			resourceId,
			holdId: holdResult.holdId,
			sessionId,
			bookingId: ulid() as BookingId,
			start: unixStart,
			end: unixEnd,
		});

		expect(confirmEvent).not.toBeNull();
		if (confirmEvent) {
			expect(confirmEvent.payload.start).toBe(unixStart);
			expect(confirmEvent.payload.end).toBe(unixEnd);
			expect(confirmEvent.createdAt).toBeGreaterThan(0);
		}
	}
});
