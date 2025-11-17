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

	const confirmEvent = await allocator.confirmBooking({
		tenantId,
		resourceId,
		holdId: holdResult.holdId,
		bookingId: ulid() as BookingId,
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
