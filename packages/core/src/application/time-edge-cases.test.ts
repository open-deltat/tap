import { expect, test } from 'bun:test';
import { ulid } from 'ulid';
import type { BookingId, ResourceId, TenantId } from '../domain/ids';
import { parseDayToUnixStartOfDayUTC } from '../infrastructure/day-utils';
import { createAllocator } from './allocator/allocator';
import { isWithinHorizon } from './horizon';

test('allocator handles bookings at midnight boundary', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-31';

	const dayStartUnix = parseDayToUnixStartOfDayUTC(day);
	const lastMinuteOfDay = 1439;
	const firstMinuteOfNextDay = 0;
	const nextDay = '2026-01-01';
	const nextDayStartUnix = parseDayToUnixStartOfDayUTC(nextDay);

	const holdResult1 = await allocator.placeHold({
		tenantId,
		resourceId,
		day,
		startMinute: lastMinuteOfDay - 60,
		endMinute: lastMinuteOfDay,
		expiresAt: dayStartUnix + 60_000,
	});

	expect(holdResult1.success).toBeTrue();

	const holdResult2 = await allocator.placeHold({
		tenantId,
		resourceId,
		day: nextDay,
		startMinute: firstMinuteOfNextDay,
		endMinute: firstMinuteOfNextDay + 60,
		expiresAt: nextDayStartUnix + 60_000,
	});

	expect(holdResult2.success).toBeTrue();
});

test('allocator handles concurrent bookings at exact same time', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId1 = ulid() as ResourceId;
	const resourceId2 = ulid() as ResourceId;
	const day = '2025-12-25';
	const exactTime = Date.now() + 60_000;

	const [result1, result2] = await Promise.all([
		allocator.placeHold({
			tenantId,
			resourceId: resourceId1,
			day,
			startMinute: 600,
			endMinute: 660,
			expiresAt: exactTime,
		}),
		allocator.placeHold({
			tenantId,
			resourceId: resourceId2,
			day,
			startMinute: 600,
			endMinute: 660,
			expiresAt: exactTime,
		}),
	]);

	expect(result1.success).toBeTrue();
	expect(result2.success).toBeTrue();
});

test('allocator prevents double booking at exact same minute range', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-25';

	const holdResult1 = await allocator.placeHold({
		tenantId,
		resourceId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	expect(holdResult1.success).toBeTrue();

	if (holdResult1.success) {
		const dayStartUnix = parseDayToUnixStartOfDayUTC(day);
		const start = dayStartUnix + 600 * 60 * 1000;
		const end = dayStartUnix + 660 * 60 * 1000;

		const confirmEvent = await allocator.confirmBooking({
			tenantId,
			resourceId,
			holdId: holdResult1.holdId,
			bookingId: ulid() as BookingId,
			start,
			end,
		});

		expect(confirmEvent).not.toBeNull();

		const holdResult2 = await allocator.placeHold({
			tenantId,
			resourceId,
			day,
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60_000,
		});

		expect(holdResult2.success).toBeFalse();
	}
});

test('allocator handles hold expiration at exact boundary', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-25';

	const exactExpiryTime = Date.now() + 5000;

	await allocator.placeHold({
		tenantId,
		resourceId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: exactExpiryTime,
	});

	const expiredBefore = allocator.expireHolds(exactExpiryTime - 1);
	expect(expiredBefore.length).toBe(0);

	const expiredAt = allocator.expireHolds(exactExpiryTime);
	expect(expiredAt.length).toBe(1);

	const expiredAfter = allocator.expireHolds(exactExpiryTime + 1);
	expect(expiredAfter.length).toBe(0);
});

test('isWithinHorizon handles leap year correctly', () => {
	const leapDay = '2024-02-29';
	const horizonDays = 90;
	const unixNow = Date.UTC(2024, 1, 29, 12, 0, 0, 0);

	const result = isWithinHorizon(leapDay, horizonDays, unixNow);
	expect(result).toBe(true);
});

test('isWithinHorizon handles year boundary correctly', () => {
	const lastDayOfYear = '2024-12-31';
	const firstDayOfYear = '2025-01-01';
	const horizonDays = 90;

	const unixAtYearEnd = Date.UTC(2024, 11, 31, 12, 0, 0, 0);

	const result1 = isWithinHorizon(lastDayOfYear, horizonDays, unixAtYearEnd);
	const result2 = isWithinHorizon(firstDayOfYear, horizonDays, unixAtYearEnd);

	expect(result1).toBe(true);
	expect(result2).toBe(true);
});

test('allocator handles bookings spanning month boundaries', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const lastDayOfMonth = '2025-01-31';
	const firstDayOfNextMonth = '2025-02-01';

	const dayStart1 = parseDayToUnixStartOfDayUTC(lastDayOfMonth);
	const dayStart2 = parseDayToUnixStartOfDayUTC(firstDayOfNextMonth);

	const holdResult1 = await allocator.placeHold({
		tenantId,
		resourceId,
		day: lastDayOfMonth,
		startMinute: 1430,
		endMinute: 1440,
		expiresAt: dayStart1 + 60_000,
	});

	expect(holdResult1.success).toBeTrue();

	const holdResult2 = await allocator.placeHold({
		tenantId,
		resourceId,
		day: firstDayOfNextMonth,
		startMinute: 0,
		endMinute: 30,
		expiresAt: dayStart2 + 60_000,
	});

	expect(holdResult2.success).toBeTrue();
});

test('allocator handles very long booking ranges', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-25';

	const dayStartUnix = parseDayToUnixStartOfDayUTC(day);

	const holdResult = await allocator.placeHold({
		tenantId,
		resourceId,
		day,
		startMinute: 0,
		endMinute: 1440,
		expiresAt: dayStartUnix + 60_000,
	});

	expect(holdResult.success).toBeTrue();

	if (holdResult.success) {
		const start = dayStartUnix;
		const end = dayStartUnix + 1440 * 60 * 1000;

		const confirmEvent = await allocator.confirmBooking({
			tenantId,
			resourceId,
			holdId: holdResult.holdId,
			bookingId: ulid() as BookingId,
			start,
			end,
		});

		expect(confirmEvent).not.toBeNull();
	}
});

test('allocator handles overlapping holds at boundaries', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-25';

	const holdResult1 = await allocator.placeHold({
		tenantId,
		resourceId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	expect(holdResult1.success).toBeTrue();

	const holdResult2 = await allocator.placeHold({
		tenantId,
		resourceId,
		day,
		startMinute: 659,
		endMinute: 720,
		expiresAt: Date.now() + 60_000,
	});

	expect(holdResult2.success).toBeFalse();

	const holdResult3 = await allocator.placeHold({
		tenantId,
		resourceId,
		day,
		startMinute: 660,
		endMinute: 720,
		expiresAt: Date.now() + 60_000,
	});

	expect(holdResult3.success).toBeTrue();
});

test('allocator state is consistent across day boundaries', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day1 = '2025-12-31';
	const day2 = '2026-01-01';

	const holdResult1 = await allocator.placeHold({
		tenantId,
		resourceId,
		day: day1,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	const holdResult2 = await allocator.placeHold({
		tenantId,
		resourceId,
		day: day2,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	expect(holdResult1.success).toBeTrue();
	expect(holdResult2.success).toBeTrue();

	const state = allocator.getState(tenantId, resourceId);
	expect(state.has(day1)).toBeTrue();
	expect(state.has(day2)).toBeTrue();
});
