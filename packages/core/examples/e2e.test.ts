import { expect, test } from 'bun:test';
import { ulid } from 'ulid';
import { createInMemoryEventStore, createInventory } from '../src/index';
import type { BookingId, ResourceId, SessionId, TenantId } from '../src/domain/ids';

test('e2e: place hold, confirm booking, check events', async () => {
	const inventory = createInventory();
	const eventStore = createInMemoryEventStore();

	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const sessionId = 'sess_e2e' as SessionId;
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

	expect(holdResult.success).toBeTrue();
	if (!holdResult.success) {
		throw new Error('Hold placement failed');
	}

	await eventStore.append(holdResult.event);

	const dayStart = new Date(day).setHours(0, 0, 0, 0);
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
		customerEmail: 'test@example.com',
		priceCents: 5000,
	});

	expect(confirmEvent).not.toBeNull();
	if (!confirmEvent) {
		throw new Error('Booking confirmation failed');
	}

	await eventStore.append(confirmEvent);

	const events = await eventStore.getAll();
	expect(events.length).toBe(2);
	expect(events[0]?.type).toBe('HoldPlaced');
	expect(events[1]?.type).toBe('BookingConfirmed');
});

test('e2e: concurrent holds, only one succeeds', async () => {
	const inventory = createInventory();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const sessionId = 'sess_e2e' as SessionId;
	const day = '2025-12-25';

	const results = await Promise.all([
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
			sessionId,
			day,
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60_000,
		}),
		inventory.placeHold({
			tenantId,
			resourceId,
			sessionId,
			day,
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60_000,
		}),
	]);

	const successful = results.filter((r) => r.success);
	expect(successful.length).toBe(1);
});

test('e2e: hold expiry workflow', async () => {
	const inventory = createInventory();
	const eventStore = createInMemoryEventStore();

	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const sessionId = 'sess_e2e' as SessionId;
	const day = '2025-12-25';

	const holdResult = await inventory.placeHold({
		tenantId,
		resourceId,
		sessionId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() - 1000,
	});

	expect(holdResult.success).toBeTrue();

	const expiredEvents = inventory.expireHolds(Date.now());
	expect(expiredEvents.length).toBeGreaterThan(0);
	expect(expiredEvents[0].payload.holdId).toBe(
		holdResult.success ? holdResult.holdId : '',
	);

	const state = inventory.getState(tenantId, resourceId);
	const dayState = state.get(day);
	expect(dayState).toBeDefined();

	if (dayState) {
		let hasHeldBits = false;
		for (let m = 600; m < 660; m++) {
			const byte = m >> 3;
			const bit = m & 7;
			if (dayState.held[byte] & (1 << bit)) {
				hasHeldBits = true;
				break;
			}
		}
		expect(hasHeldBits).toBeFalse();
	}
});

test('e2e: multiple non-overlapping holds', async () => {
	const inventory = createInventory();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const sessionId = 'sess_e2e' as SessionId;
	const day = '2025-12-25';

	const hold1 = await inventory.placeHold({
		tenantId,
		resourceId,
		sessionId,
		day,
		startMinute: 600,
		endMinute: 630,
		expiresAt: Date.now() + 60_000,
	});

	const hold2 = await inventory.placeHold({
		tenantId,
		resourceId,
		sessionId,
		day,
		startMinute: 630,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	const hold3 = await inventory.placeHold({
		tenantId,
		resourceId,
		sessionId,
		day,
		startMinute: 660,
		endMinute: 690,
		expiresAt: Date.now() + 60_000,
	});

	expect(hold1.success).toBeTrue();
	expect(hold2.success).toBeTrue();
	expect(hold3.success).toBeTrue();
});

test('e2e: event store filtering', async () => {
	const eventStore = createInMemoryEventStore();
	const inventory = createInventory();

	const tenantId1 = ulid() as TenantId;
	const tenantId2 = ulid() as TenantId;
	const resourceId1 = ulid() as ResourceId;
	const resourceId2 = ulid() as ResourceId;
	const sessionId = 'sess_e2e' as SessionId;
	const day = '2025-12-25';

	const hold1 = await inventory.placeHold({
		tenantId: tenantId1,
		resourceId: resourceId1,
		sessionId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	const hold2 = await inventory.placeHold({
		tenantId: tenantId1,
		resourceId: resourceId2,
		sessionId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	const hold3 = await inventory.placeHold({
		tenantId: tenantId2,
		resourceId: resourceId1,
		sessionId,
		day,
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	if (hold1.success) await eventStore.append(hold1.event);
	if (hold2.success) await eventStore.append(hold2.event);
	if (hold3.success) await eventStore.append(hold3.event);

	const tenant1Events = await eventStore.getByTenant(tenantId1);
	expect(tenant1Events.length).toBe(2);

	const resource1Events = await eventStore.getByResource(tenantId1, resourceId1);
	expect(resource1Events.length).toBe(1);
});
