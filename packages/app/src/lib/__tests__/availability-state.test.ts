import { expect, test } from 'bun:test';
import type { BookingEvent } from '@tap/ws-client';
import {
	applyBookingEvent,
	createAvailabilityState,
	getAvailableSlots,
	isSlotAvailable,
} from '../availability-state';

test('createAvailabilityState creates an empty availability state', () => {
	const state = createAvailabilityState();
	expect(state.size).toBe(0);
});

test('applyBookingEvent applies HoldPlaced event correctly', () => {
	const state = createAvailabilityState();
	const event: BookingEvent = {
		eventId: 'evt_1',
		tenantId: 'ten_1',
		resourceId: 'res_1',
		type: 'HoldPlaced',
		version: 1,
		payload: {
			holdId: 'hold_1',
			day: '2025-01-10',
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 30000,
		},
		createdAt: Date.now(),
	};

	applyBookingEvent(state, event);

	const dayState = state.get('2025-01-10');
	expect(dayState).toBeDefined();
	expect(dayState?.held.has(600)).toBe(true);
	expect(dayState?.held.has(659)).toBe(true);
	expect(dayState?.held.has(660)).toBe(false);
	expect(dayState?.holdMetadata.has('hold_1')).toBe(true);
});

test('applyBookingEvent applies HoldExpired event correctly', () => {
	const state = createAvailabilityState();
	// First place a hold to set up the state properly
	const holdPlacedEvent: BookingEvent = {
		eventId: 'evt_1',
		tenantId: 'ten_1',
		resourceId: 'res_1',
		type: 'HoldPlaced',
		version: 1,
		payload: {
			holdId: 'hold_1',
			day: '2025-01-10',
			startMinute: 600,
			endMinute: 603,
			expiresAt: Date.now() + 30000,
		},
		createdAt: Date.now(),
	};
	applyBookingEvent(state, holdPlacedEvent);

	const event: BookingEvent = {
		eventId: 'evt_2',
		tenantId: 'ten_1',
		resourceId: 'res_1',
		type: 'HoldExpired',
		version: 1,
		payload: {
			holdId: 'hold_1',
		},
		createdAt: Date.now(),
	};

	applyBookingEvent(state, event);

	// When hold expires and day becomes empty, the day is removed from state
	const updatedDayState = state.get('2025-01-10');
	if (updatedDayState) {
		expect(updatedDayState.held.size).toBe(0);
		expect(updatedDayState.holdMetadata.has('hold_1')).toBe(false);
	} else {
		// Day was removed because it became empty
		expect(state.has('2025-01-10')).toBe(false);
	}
});

test('applyBookingEvent only removes the specific hold when HoldExpired is applied', () => {
	const state = createAvailabilityState();
	const dayState = {
		booked: new Set<number>(),
		held: new Set<number>([600, 601, 602, 700, 701, 702]),
		holdMetadata: new Map([
			['hold_1', { startMinute: 600, endMinute: 603 }],
			['hold_2', { startMinute: 700, endMinute: 703 }],
		]),
	};
	state.set('2025-01-10', dayState);

	const event: BookingEvent = {
		eventId: 'evt_2',
		tenantId: 'ten_1',
		resourceId: 'res_1',
		type: 'HoldExpired',
		version: 1,
		payload: {
			holdId: 'hold_1',
		},
		createdAt: Date.now(),
	};

	applyBookingEvent(state, event);

	const updatedDayState = state.get('2025-01-10');
	expect(updatedDayState?.held.has(600)).toBe(false);
	expect(updatedDayState?.held.has(700)).toBe(true);
	expect(updatedDayState?.holdMetadata.has('hold_1')).toBe(false);
	expect(updatedDayState?.holdMetadata.has('hold_2')).toBe(true);
});

test('applyBookingEvent applies BookingConfirmed event correctly', () => {
	const state = createAvailabilityState();
	const dayState = {
		booked: new Set<number>(),
		held: new Set<number>([600, 601, 602]),
		holdMetadata: new Map([['hold_1', { startMinute: 600, endMinute: 603 }]]),
	};
	state.set('2025-01-10', dayState);

	const dayStart = new Date('2025-01-10T00:00:00Z').getTime();
	const start = dayStart + 600 * 60 * 1000;
	const end = dayStart + 660 * 60 * 1000;

	const event: BookingEvent = {
		eventId: 'evt_3',
		tenantId: 'ten_1',
		resourceId: 'res_1',
		type: 'BookingConfirmed',
		version: 1,
		payload: {
			bookingId: 'book_1',
			holdId: 'hold_1',
			start,
			end,
		},
		createdAt: Date.now(),
	};

	applyBookingEvent(state, event);

	const updatedDayState = state.get('2025-01-10');
	expect(updatedDayState?.held.has(600)).toBe(false);
	expect(updatedDayState?.booked.has(600)).toBe(true);
	expect(updatedDayState?.booked.has(659)).toBe(true);
	expect(updatedDayState?.holdMetadata.has('hold_1')).toBe(false);
});

test('applyBookingEvent applies BookingCancelled event correctly', () => {
	const state = createAvailabilityState();
	// First create a booking to set up the state properly
	const dayStart = new Date('2025-01-10T00:00:00Z').getTime();
	const start = dayStart + 600 * 60 * 1000;
	const end = dayStart + 660 * 60 * 1000;

	const bookingEvent: BookingEvent = {
		eventId: 'evt_booking',
		tenantId: 'ten_1',
		resourceId: 'res_1',
		type: 'BookingConfirmed',
		version: 1,
		payload: {
			bookingId: 'book_1',
			holdId: 'hold_1',
			start,
			end,
		},
		createdAt: Date.now(),
	};
	applyBookingEvent(state, bookingEvent);

	const event: BookingEvent = {
		eventId: 'evt_4',
		tenantId: 'ten_1',
		resourceId: 'res_1',
		type: 'BookingCancelled',
		version: 1,
		payload: {
			bookingId: 'book_1',
		},
		createdAt: Date.now(),
	};

	applyBookingEvent(state, event);

	// BookingCancelled removes all booked minutes from all days
	// Since we only had one booking, the day should be empty and removed
	const updatedDayState = state.get('2025-01-10');
	if (updatedDayState) {
		expect(updatedDayState.booked.size).toBe(0);
	} else {
		// Day was removed because it became empty
		expect(state.has('2025-01-10')).toBe(false);
	}
});

test('applyBookingEvent removes empty day states after HoldExpired', () => {
	const state = createAvailabilityState();
	const dayState = {
		booked: new Set<number>(),
		held: new Set<number>([600]),
		holdMetadata: new Map([['hold_1', { startMinute: 600, endMinute: 601 }]]),
	};
	state.set('2025-01-10', dayState);

	const event: BookingEvent = {
		eventId: 'evt_5',
		tenantId: 'ten_1',
		resourceId: 'res_1',
		type: 'HoldExpired',
		version: 1,
		payload: {
			holdId: 'hold_1',
		},
		createdAt: Date.now(),
	};

	applyBookingEvent(state, event);

	expect(state.has('2025-01-10')).toBe(false);
});

test('isSlotAvailable returns true for available slot', () => {
	const state = createAvailabilityState();
	expect(isSlotAvailable(state, '2025-01-10', 600, 660)).toBe(true);
});

test('isSlotAvailable returns false when slot is held', () => {
	const state = createAvailabilityState();
	const dayState = {
		booked: new Set<number>(),
		held: new Set<number>([610]),
		holdMetadata: new Map(),
	};
	state.set('2025-01-10', dayState);

	expect(isSlotAvailable(state, '2025-01-10', 600, 660)).toBe(false);
});

test('isSlotAvailable returns false when slot is booked', () => {
	const state = createAvailabilityState();
	const dayState = {
		booked: new Set<number>([610]),
		held: new Set<number>(),
		holdMetadata: new Map(),
	};
	state.set('2025-01-10', dayState);

	expect(isSlotAvailable(state, '2025-01-10', 600, 660)).toBe(false);
});

test('getAvailableSlots returns available slots for a day', () => {
	const state = createAvailabilityState();
	const dayKey = '2025-01-10';
	const dayStart = new Date('2025-01-10T00:00:00Z').getTime();

	// Need to set up state with some availability
	const dayState = {
		booked: new Set<number>(),
		held: new Set<number>(),
		holdMetadata: new Map(),
	};
	state.set(dayKey, dayState);

	const slots = getAvailableSlots(state, dayKey, 600, 720, 60, 15);

	expect(slots.length).toBeGreaterThan(0);
	expect(slots[0]?.start).toBe(dayStart + 600 * 60 * 1000);
	expect(slots[0]?.end).toBe(dayStart + 660 * 60 * 1000);
});

test('getAvailableSlots excludes slots that are held', () => {
	const state = createAvailabilityState();
	const dayState = {
		booked: new Set<number>(),
		held: new Set<number>([600, 601, 602, 603, 604]),
		holdMetadata: new Map(),
	};
	state.set('2025-01-10', dayState);

	const slots = getAvailableSlots(state, '2025-01-10', 600, 720, 60, 15);

	const conflictingSlot = slots.find(
		(s) => s.start === new Date('2025-01-10T10:00:00Z').getTime(),
	);
	expect(conflictingSlot).toBeUndefined();
});

test('getAvailableSlots excludes slots that are booked', () => {
	const state = createAvailabilityState();
	const dayState = {
		booked: new Set<number>([600, 601, 602, 603, 604]),
		held: new Set<number>(),
		holdMetadata: new Map(),
	};
	state.set('2025-01-10', dayState);

	const slots = getAvailableSlots(state, '2025-01-10', 600, 720, 60, 15);

	const conflictingSlot = slots.find(
		(s) => s.start === new Date('2025-01-10T10:00:00Z').getTime(),
	);
	expect(conflictingSlot).toBeUndefined();
});
