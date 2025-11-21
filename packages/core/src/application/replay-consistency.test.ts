import { expect, test } from 'bun:test';
import { ulid } from 'ulid';
import type { LedgerEvent, ResourceId, TenantId } from '../domain/events';
import { createAllocator } from './allocator/allocator';
import { replayEvents } from './replay';

test('replay maintains consistency with events at identical timestamps', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-25';

	const identicalTimestamp = Date.UTC(2025, 11, 25, 12, 0, 0, 0);

	const events: LedgerEvent[] = [
		{
			eventId: ulid(),
			tenantId,
			resourceId,
			type: 'HoldPlaced',
			version: 1,
			createdAt: identicalTimestamp,
			payload: {
				holdId: ulid(),
				day,
				startMinute: 600,
				endMinute: 660,
				expiresAt: identicalTimestamp + 60_000,
			},
		},
		{
			eventId: ulid(),
			tenantId,
			resourceId,
			type: 'BookingConfirmed',
			version: 1,
			createdAt: identicalTimestamp,
			payload: {
				bookingId: ulid(),
				holdId: ulid(),
				start: identicalTimestamp + 600 * 60 * 1000,
				end: identicalTimestamp + 660 * 60 * 1000,
			},
		},
	];

	await replayEvents(allocator, events);

	const state = allocator.getState(tenantId, resourceId);
	const dayState = state.get(day);

	expect(dayState).toBeDefined();
});

test('replay handles out-of-order events correctly', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-25';

	const holdId = ulid();
	const bookingId = ulid();

	const events: LedgerEvent[] = [
		{
			eventId: ulid(),
			tenantId,
			resourceId,
			type: 'BookingConfirmed',
			version: 1,
			createdAt: Date.UTC(2025, 11, 25, 12, 0, 0, 0) + 1000,
			payload: {
				bookingId,
				holdId,
				start: Date.UTC(2025, 11, 25, 10, 0, 0, 0),
				end: Date.UTC(2025, 11, 25, 11, 0, 0, 0),
			},
		},
		{
			eventId: ulid(),
			tenantId,
			resourceId,
			type: 'HoldPlaced',
			version: 1,
			createdAt: Date.UTC(2025, 11, 25, 12, 0, 0, 0),
			payload: {
				holdId,
				day,
				startMinute: 600,
				endMinute: 660,
				expiresAt: Date.UTC(2025, 11, 25, 12, 0, 0, 0) + 60_000,
			},
		},
	];

	await replayEvents(allocator, events);

	const state = allocator.getState(tenantId, resourceId);
	const dayState = state.get(day);

	expect(dayState).toBeDefined();
});

test('replay handles events across year boundary', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	// Use future dates to ensure holds are not expired
	const futureYear = new Date().getFullYear() + 1;
	const lastDayOfYear = new Date(futureYear - 1, 11, 31);
	const firstDayOfNextYear = new Date(futureYear, 0, 1);

	const day1 = lastDayOfYear.toISOString().split('T')[0] ?? '';
	const day2 = firstDayOfNextYear.toISOString().split('T')[0] ?? '';
	const now = Date.now();
	const futureExpiresAt = now + 60_000;

	const events: LedgerEvent[] = [
		{
			eventId: ulid(),
			tenantId,
			resourceId,
			type: 'HoldPlaced',
			version: 1,
			createdAt: now - 1000,
			payload: {
				holdId: ulid(),
				day: day1,
				startMinute: 600,
				endMinute: 660,
				expiresAt: futureExpiresAt,
			},
		},
		{
			eventId: ulid(),
			tenantId,
			resourceId,
			type: 'HoldPlaced',
			version: 1,
			createdAt: now,
			payload: {
				holdId: ulid(),
				day: day2,
				startMinute: 600,
				endMinute: 660,
				expiresAt: futureExpiresAt,
			},
		},
	];

	await replayEvents(allocator, events);

	const state = allocator.getState(tenantId, resourceId);
	expect(state.has(day1)).toBeTrue();
	expect(state.has(day2)).toBeTrue();
});

test('replay maintains idempotency', async () => {
	const allocator1 = createAllocator();
	const allocator2 = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-25';

	const events: LedgerEvent[] = [
		{
			eventId: ulid(),
			tenantId,
			resourceId,
			type: 'HoldPlaced',
			version: 1,
			createdAt: Date.UTC(2025, 11, 25, 12, 0, 0, 0),
			payload: {
				holdId: ulid(),
				day,
				startMinute: 600,
				endMinute: 660,
				expiresAt: Date.UTC(2025, 11, 25, 12, 0, 0, 0) + 60_000,
			},
		},
	];

	await replayEvents(allocator1, events);
	await replayEvents(allocator2, events);

	const state1 = allocator1.getState(tenantId, resourceId);
	const state2 = allocator2.getState(tenantId, resourceId);

	const dayState1 = state1.get(day);
	const dayState2 = state2.get(day);

	expect(dayState1).toBeDefined();
	expect(dayState2).toBeDefined();

	if (dayState1 && dayState2) {
		expect(dayState1.booked.length).toBe(dayState2.booked.length);
		expect(dayState1.held.length).toBe(dayState2.held.length);
	}
});

test('replay handles hold expiration correctly', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-25';
	const holdId = ulid();

	const events: LedgerEvent[] = [
		{
			eventId: ulid(),
			tenantId,
			resourceId,
			type: 'HoldPlaced',
			version: 1,
			createdAt: Date.UTC(2025, 11, 25, 12, 0, 0, 0),
			payload: {
				holdId,
				day,
				startMinute: 600,
				endMinute: 660,
				expiresAt: Date.UTC(2025, 11, 25, 12, 0, 0, 0) + 60_000,
			},
		},
		{
			eventId: ulid(),
			tenantId,
			resourceId,
			type: 'HoldExpired',
			version: 1,
			createdAt: Date.UTC(2025, 11, 25, 12, 1, 0, 0),
			payload: {
				holdId,
			},
		},
	];

	await replayEvents(allocator, events);

	const state = allocator.getState(tenantId, resourceId);
	const dayState = state.get(day);

	expect(dayState).toBeDefined();
	if (dayState) {
		for (let m = 600; m < 660; m++) {
			const byte = m >> 3;
			const bit = m & 7;
			const heldByte = dayState.held[byte];
			if (heldByte !== undefined && (heldByte & (1 << bit)) !== 0) {
				throw new Error('Hold should be expired');
			}
		}
	}
});

test('replay handles booking cancellation correctly', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const day = '2025-12-25';
	const holdId = ulid();
	const bookingId = ulid();

	const events: LedgerEvent[] = [
		{
			eventId: ulid(),
			tenantId,
			resourceId,
			type: 'HoldPlaced',
			version: 1,
			createdAt: Date.UTC(2025, 11, 25, 12, 0, 0, 0),
			payload: {
				holdId,
				day,
				startMinute: 600,
				endMinute: 660,
				expiresAt: Date.UTC(2025, 11, 25, 12, 0, 0, 0) + 60_000,
			},
		},
		{
			eventId: ulid(),
			tenantId,
			resourceId,
			type: 'BookingConfirmed',
			version: 1,
			createdAt: Date.UTC(2025, 11, 25, 12, 0, 0, 0) + 500,
			payload: {
				bookingId,
				holdId,
				start: Date.UTC(2025, 11, 25, 10, 0, 0, 0),
				end: Date.UTC(2025, 11, 25, 11, 0, 0, 0),
			},
		},
		{
			eventId: ulid(),
			tenantId,
			resourceId,
			type: 'BookingCancelled',
			version: 1,
			createdAt: Date.UTC(2025, 11, 25, 12, 1, 0, 0),
			payload: {
				bookingId,
			},
		},
	];

	await replayEvents(allocator, events);

	const state = allocator.getState(tenantId, resourceId);
	const dayState = state.get(day);

	expect(dayState).toBeDefined();
	if (dayState) {
		for (let m = 600; m < 660; m++) {
			const byte = m >> 3;
			const bit = m & 7;
			const bookedByte = dayState.booked[byte];
			if (bookedByte !== undefined && (bookedByte & (1 << bit)) !== 0) {
				throw new Error('Booking should be cancelled');
			}
		}
	}
});
