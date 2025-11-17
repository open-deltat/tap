import { expect, test } from 'bun:test';
import type { ResourceId, TenantId } from '@tap/core';
import { ulid } from 'ulid';
import { getAllocator, getEventStore } from '../services/context';
import { startHoldExpiryWorker } from './hold-expiry';

test('startHoldExpiryWorker returns stop function', () => {
	const stop = startHoldExpiryWorker(100);
	expect(typeof stop).toBe('function');
	stop();
});

test('startHoldExpiryWorker expires holds and creates events', async () => {
	const allocator = getAllocator();
	const eventStore = getEventStore();

	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const holdResult = await allocator.placeHold({
		tenantId,
		resourceId,
		day: '2025-12-01',
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() - 1000,
	});

	expect(holdResult.success).toBe(true);
	if (holdResult.success) {
		await eventStore.append(holdResult.event);

		const expired = allocator.expireHolds(Date.now());
		expect(expired.length).toBeGreaterThan(0);

		const stop = startHoldExpiryWorker(100);
		await new Promise((resolve) => setTimeout(resolve, 200));
		stop();
	}
});

test('startHoldExpiryWorker can be stopped', async () => {
	const stop = startHoldExpiryWorker(50);
	expect(typeof stop).toBe('function');

	stop();

	await new Promise((resolve) => setTimeout(resolve, 100));

	stop();
});
