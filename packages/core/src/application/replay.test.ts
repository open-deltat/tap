import { expect, test } from 'bun:test';
import { ulid } from 'ulid';
import type { LedgerEvent } from '../domain/events';
import type { BookingId, HoldId, ResourceId, TenantId } from '../domain/ids';
import { createAllocator } from './allocator/allocator';
import {
	createBookingCancelledEvent,
	createBookingConfirmedEvent,
	createHoldExpiredEvent,
	createHoldPlacedEvent,
} from './event-factory';
import { replayEvents } from './replay';

test('replayEvents rebuilds state from HoldPlaced events', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const holdId = ulid() as HoldId;

	const events: LedgerEvent[] = [
		createHoldPlacedEvent({
			tenantId,
			resourceId,
			holdId,
			day: '2025-12-01',
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60_000,
		}),
	];

	await replayEvents(allocator, events);

	const state = allocator.getState(tenantId, resourceId);
	const dayState = state.get('2025-12-01');
	expect(dayState).toBeDefined();

	if (dayState) {
		let hasHeldBits = false;
		for (let m = 600; m < 660; m++) {
			const byte = m >> 3;
			const bit = m & 7;
			if (dayState.held[byte] && (dayState.held[byte] & (1 << bit)) !== 0) {
				hasHeldBits = true;
				break;
			}
		}
		expect(hasHeldBits).toBe(true);
	}
});

test('replayEvents handles HoldExpired events', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const holdId = ulid() as HoldId;

	const holdPlaced = createHoldPlacedEvent({
		tenantId,
		resourceId,
		holdId,
		day: '2025-12-01',
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	const holdExpired = createHoldExpiredEvent({
		tenantId,
		resourceId,
		holdId,
	});

	holdExpired.createdAt = holdPlaced.createdAt + 1000;

	const events: LedgerEvent[] = [holdPlaced, holdExpired];

	await replayEvents(allocator, events);

	const state = allocator.getState(tenantId, resourceId);
	const dayState = state.get('2025-12-01');

	if (dayState) {
		let hasHeldBits = false;
		for (let m = 600; m < 660; m++) {
			const byte = m >> 3;
			const bit = m & 7;
			if (dayState.held[byte] && (dayState.held[byte] & (1 << bit)) !== 0) {
				hasHeldBits = true;
				break;
			}
		}
		expect(hasHeldBits).toBe(false);
	} else {
		expect(dayState).toBeDefined();
	}
});

test('replayEvents handles BookingConfirmed events', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const holdId = ulid() as HoldId;
	const bookingId = ulid() as BookingId;
	const dayStart = new Date('2025-12-01').setHours(0, 0, 0, 0);
	const start = dayStart + 600 * 60 * 1000;
	const end = dayStart + 660 * 60 * 1000;

	const events: LedgerEvent[] = [
		createHoldPlacedEvent({
			tenantId,
			resourceId,
			holdId,
			day: '2025-12-01',
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60_000,
		}),
		createBookingConfirmedEvent({
			tenantId,
			resourceId,
			bookingId,
			holdId,
			start,
			end,
		}),
	];

	await replayEvents(allocator, events);

	const state = allocator.getState(tenantId, resourceId);
	const dayState = state.get('2025-12-01');
	expect(dayState).toBeDefined();

	if (dayState) {
		let hasBookedBits = false;
		let hasHeldBits = false;
		for (let m = 600; m < 660; m++) {
			const byte = m >> 3;
			const bit = m & 7;
			if (dayState.booked[byte] && (dayState.booked[byte] & (1 << bit)) !== 0) {
				hasBookedBits = true;
			}
			if (dayState.held[byte] && (dayState.held[byte] & (1 << bit)) !== 0) {
				hasHeldBits = true;
			}
		}
		expect(hasBookedBits).toBe(true);
		expect(hasHeldBits).toBe(false);
	}
});

test('replayEvents handles BookingCancelled events', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const holdId = ulid() as HoldId;
	const bookingId = ulid() as BookingId;
	const dayStart = new Date('2025-12-01').setHours(0, 0, 0, 0);
	const start = dayStart + 600 * 60 * 1000;
	const end = dayStart + 660 * 60 * 1000;

	const holdPlaced = createHoldPlacedEvent({
		tenantId,
		resourceId,
		holdId,
		day: '2025-12-01',
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	const bookingConfirmed = createBookingConfirmedEvent({
		tenantId,
		resourceId,
		bookingId,
		holdId,
		start,
		end,
	});

	const bookingCancelled = createBookingCancelledEvent({
		tenantId,
		resourceId,
		bookingId,
	});

	bookingConfirmed.createdAt = holdPlaced.createdAt + 1000;
	bookingCancelled.createdAt = bookingConfirmed.createdAt + 1000;

	const events: LedgerEvent[] = [
		holdPlaced,
		bookingConfirmed,
		bookingCancelled,
	];

	await replayEvents(allocator, events);

	const state = allocator.getState(tenantId, resourceId);
	const dayState = state.get('2025-12-01');
	expect(dayState).toBeDefined();

	if (dayState) {
		let hasBookedBits = false;
		for (let m = 600; m < 660; m++) {
			const byte = m >> 3;
			const bit = m & 7;
			if (dayState.booked[byte] && (dayState.booked[byte] & (1 << bit)) !== 0) {
				hasBookedBits = true;
				break;
			}
		}
		expect(hasBookedBits).toBe(false);
	}
});

test('replayEvents handles multiple resources', async () => {
	const allocator = createAllocator();
	const tenantId = ulid() as TenantId;
	const resourceId1 = ulid() as ResourceId;
	const resourceId2 = ulid() as ResourceId;
	const holdId1 = ulid() as HoldId;
	const holdId2 = ulid() as HoldId;

	const events: LedgerEvent[] = [
		createHoldPlacedEvent({
			tenantId,
			resourceId: resourceId1,
			holdId: holdId1,
			day: '2025-12-01',
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60_000,
		}),
		createHoldPlacedEvent({
			tenantId,
			resourceId: resourceId2,
			holdId: holdId2,
			day: '2025-12-01',
			startMinute: 700,
			endMinute: 760,
			expiresAt: Date.now() + 60_000,
		}),
	];

	await replayEvents(allocator, events);

	const state1 = allocator.getState(tenantId, resourceId1);
	const state2 = allocator.getState(tenantId, resourceId2);

	const dayState1 = state1.get('2025-12-01');
	const dayState2 = state2.get('2025-12-01');

	expect(dayState1).toBeDefined();
	expect(dayState2).toBeDefined();

	if (dayState1 && dayState2) {
		let hasHeldBits1 = false;
		let hasHeldBits2 = false;
		for (let m = 600; m < 660; m++) {
			const byte = m >> 3;
			const bit = m & 7;
			if (dayState1.held[byte] && (dayState1.held[byte] & (1 << bit)) !== 0) {
				hasHeldBits1 = true;
			}
		}
		for (let m = 700; m < 760; m++) {
			const byte = m >> 3;
			const bit = m & 7;
			if (dayState2.held[byte] && (dayState2.held[byte] & (1 << bit)) !== 0) {
				hasHeldBits2 = true;
			}
		}
		expect(hasHeldBits1).toBe(true);
		expect(hasHeldBits2).toBe(true);
	}
});
