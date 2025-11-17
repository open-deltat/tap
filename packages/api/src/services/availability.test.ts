import { expect, test } from 'bun:test';
import type { AllocatorState, DayKey } from '@tap/core';
import { createBitmapDay, setBitRange } from '@tap/core';
import { getAvailability } from './availability';

const createTestState = (
	day: DayKey,
	booked: number[] = [],
	held: number[] = [],
): AllocatorState => {
	const state = new Map<DayKey, ReturnType<typeof createBitmapDay>>();
	const dayState = createBitmapDay(15);

	for (const minute of booked) {
		setBitRange(dayState.booked, minute, minute + 1, true);
	}

	for (const minute of held) {
		setBitRange(dayState.held, minute, minute + 1, true);
	}

	state.set(day, dayState);
	return state;
};

test('getAvailability returns default 9-5 weekday slots when day state does not exist', () => {
	const state = new Map();
	const day = '2025-12-01';
	const slots = getAvailability({
		state,
		day,
	});

	const dayDate = new Date(day);
	const dayOfWeek = dayDate.getDay();
	const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

	if (isWeekday) {
		expect(slots.length).toBeGreaterThan(0);
		const firstSlot = slots[0];
		if (firstSlot) {
			const slotStartMinute = Math.floor(
				(firstSlot.start - new Date(day).setHours(0, 0, 0, 0)) / (60 * 1000),
			);
			expect(slotStartMinute).toBeGreaterThanOrEqual(9 * 60);
		}
		const lastSlot = slots[slots.length - 1];
		if (lastSlot) {
			const slotEndMinute = Math.floor(
				(lastSlot.end - new Date(day).setHours(0, 0, 0, 0)) / (60 * 1000),
			);
			expect(slotEndMinute).toBeLessThanOrEqual(17 * 60);
		}
	} else {
		expect(slots).toEqual([]);
	}
});

test('getAvailability returns slots for free time ranges', () => {
	const day = '2025-12-01';
	const state = createTestState(day);

	const slots = getAvailability({
		state,
		day,
		durationMinutes: 60,
		fromMinute: 600,
		toMinute: 720,
	});

	expect(slots.length).toBeGreaterThan(0);
	const firstSlot = slots[0];
	if (firstSlot) {
		expect(firstSlot.start).toBeDefined();
		expect(firstSlot.end).toBeDefined();
		expect(firstSlot.end - firstSlot.start).toBe(60 * 60 * 1000);
	}
});

test('getAvailability excludes booked slots', () => {
	const day = '2025-12-01';
	const state = createTestState(
		day,
		[
			600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 613, 614,
			615, 616, 617, 618, 619, 620, 621, 622, 623, 624, 625, 626, 627, 628, 629,
			630, 631, 632, 633, 634, 635, 636, 637, 638, 639, 640, 641, 642, 643, 644,
			645, 646, 647, 648, 649, 650, 651, 652, 653, 654, 655, 656, 657, 658, 659,
		],
	);

	const slots = getAvailability({
		state,
		day,
		durationMinutes: 60,
		fromMinute: 600,
		toMinute: 720,
	});

	const slotAt600 = slots.find((s) => {
		const slotStartMinute = Math.floor(
			(s.start - new Date(day).setHours(0, 0, 0, 0)) / (60 * 1000),
		);
		return slotStartMinute === 600;
	});

	expect(slotAt600).toBeUndefined();
});

test('getAvailability excludes held slots', () => {
	const day = '2025-12-01';
	const state = createTestState(
		day,
		[],
		[
			600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 613, 614,
			615, 616, 617, 618, 619, 620, 621, 622, 623, 624, 625, 626, 627, 628, 629,
			630, 631, 632, 633, 634, 635, 636, 637, 638, 639, 640, 641, 642, 643, 644,
			645, 646, 647, 648, 649, 650, 651, 652, 653, 654, 655, 656, 657, 658, 659,
		],
	);

	const slots = getAvailability({
		state,
		day,
		durationMinutes: 60,
		fromMinute: 600,
		toMinute: 720,
	});

	const slotAt600 = slots.find((s) => {
		const slotStartMinute = Math.floor(
			(s.start - new Date(day).setHours(0, 0, 0, 0)) / (60 * 1000),
		);
		return slotStartMinute === 600;
	});

	expect(slotAt600).toBeUndefined();
});

test('getAvailability respects fromMinute and toMinute', () => {
	const day = '2025-12-01';
	const state = createTestState(day);

	const slots = getAvailability({
		state,
		day,
		durationMinutes: 30,
		fromMinute: 600,
		toMinute: 660,
	});

	expect(slots.length).toBeGreaterThan(0);

	for (const slot of slots) {
		const slotStartMinute = Math.floor(
			(slot.start - new Date(day).setHours(0, 0, 0, 0)) / (60 * 1000),
		);
		expect(slotStartMinute).toBeGreaterThanOrEqual(600);
		expect(slotStartMinute).toBeLessThan(660);
	}
});

test('getAvailability uses default durationMinutes of 60', () => {
	const day = '2025-12-01';
	const state = createTestState(day);

	const slots = getAvailability({
		state,
		day,
		fromMinute: 600,
		toMinute: 720,
	});

	if (slots.length > 0) {
		const firstSlot = slots[0];
		if (firstSlot) {
			expect(firstSlot.end - firstSlot.start).toBe(60 * 60 * 1000);
		}
	}
});

test('getAvailability uses default fromMinute of 0 and toMinute of 1440', () => {
	const day = '2025-12-01';
	const state = createTestState(day);

	const slots = getAvailability({
		state,
		day,
		durationMinutes: 60,
	});

	expect(slots.length).toBeGreaterThan(0);

	const firstSlot = slots[0];
	if (firstSlot) {
		const slotStartMinute = Math.floor(
			(firstSlot.start - new Date(day).setHours(0, 0, 0, 0)) / (60 * 1000),
		);
		expect(slotStartMinute).toBeGreaterThanOrEqual(0);
	}

	const lastSlot = slots[slots.length - 1];
	if (lastSlot) {
		const slotEndMinute = Math.floor(
			(lastSlot.end - new Date(day).setHours(0, 0, 0, 0)) / (60 * 1000),
		);
		expect(slotEndMinute).toBeLessThanOrEqual(1440);
	}
});

test('getAvailability returns slots with correct timestamps', () => {
	const day = '2025-12-01';
	const state = createTestState(day);

	const slots = getAvailability({
		state,
		day,
		durationMinutes: 30,
		fromMinute: 600,
		toMinute: 630,
	});

	if (slots.length > 0) {
		const dayStart = new Date(day).setHours(0, 0, 0, 0);
		const expectedStart = dayStart + 600 * 60 * 1000;
		const expectedEnd = dayStart + 630 * 60 * 1000;

		expect(slots[0]?.start).toBe(expectedStart);
		expect(slots[0]?.end).toBe(expectedEnd);
	}
});

test('getAvailability handles overlapping booked and held ranges', () => {
	const day = '2025-12-01';
	const state = createTestState(
		day,
		[600, 601, 602, 603, 604, 605],
		[606, 607, 608, 609, 610, 611],
	);

	const slots = getAvailability({
		state,
		day,
		durationMinutes: 15,
		fromMinute: 600,
		toMinute: 720,
	});

	const slotAt600 = slots.find((s) => {
		const slotStartMinute = Math.floor(
			(s.start - new Date(day).setHours(0, 0, 0, 0)) / (60 * 1000),
		);
		return slotStartMinute >= 600 && slotStartMinute < 612;
	});

	expect(slotAt600).toBeUndefined();
});
