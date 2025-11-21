import { expect, test } from 'bun:test';
import type { LedgerEvent } from '@tap/core';
import { mergeAvailability } from './merger';

const createEvent = (
	type: LedgerEvent['type'],
	idSuffix: string,
	payload: LedgerEvent['payload'],
): LedgerEvent => {
	return {
		eventId: `evt_${idSuffix}`,
		tenantId: 'ten_1',
		resourceId: 'res_1',
		type,
		version: 1,
		createdAt: Date.now(),
		payload,
	} as LedgerEvent;
};

test('mergeAvailability integration test', () => {
	// Let's pass a dummy day '1970-01-01' so start of day is 0 (UTC).
	const testDay = '1970-01-01';
	const startUnix = 9 * 60 * 60000; // 09:00
	const endUnix = 17 * 60 * 60000; // 17:00

	const initialSlots = [{ start: startUnix, end: endUnix }];

	// Event 1: Hold 10:00-11:00 (evt_02) -> New
	const holdEvent = createEvent('HoldPlaced', '02', {
		holdId: 'hold_1',
		day: testDay,
		startMinute: 10 * 60, // 600
		endMinute: 11 * 60, // 660
		// biome-ignore lint/suspicious/noExplicitAny: Test data
	} as any);

	// Event 2: Hold 13:00-14:00 (evt_03) -> New
	const holdEvent2 = createEvent('HoldPlaced', '03', {
		holdId: 'hold_2',
		day: testDay,
		startMinute: 13 * 60,
		endMinute: 14 * 60,
		// biome-ignore lint/suspicious/noExplicitAny: Test data
	} as any);

	// Event 3: Release Hold 1 (evt_04) -> New
	const releaseEvent = createEvent('HoldReleased', '04', {
		holdId: 'hold_1',
		day: testDay,
		startMinute: 10 * 60,
		endMinute: 11 * 60,
		// biome-ignore lint/suspicious/noExplicitAny: Test data
	} as any);

	// Apply events 2, 3, 4 (skipping evt_01 which is snapshot cursor)
	const result = mergeAvailability(
		initialSlots,
		[holdEvent, holdEvent2, releaseEvent],
		'evt_01',
	);

	// Expected:
	// Hold 1 placed (removes 10-11)
	// Hold 2 placed (removes 13-14)
	// Hold 1 released (adds back 10-11)
	// Final: Free 09:00-13:00, 14:00-17:00

	expect(result.length).toBe(2);
	if (result.length >= 2 && result[0] && result[1]) {
		expect(result[0].start).toBe(9 * 60 * 60000);
		expect(result[0].end).toBe(13 * 60 * 60000);
		expect(result[1].start).toBe(14 * 60 * 60000);
		expect(result[1].end).toBe(17 * 60 * 60000);
	}
});

test('mergeAvailability ignores old events', () => {
	const initialSlots = [{ start: 1000, end: 2000 }];
	const oldEvent = createEvent('HoldPlaced', '00', {
		day: '1970-01-01',
		startMinute: 0,
		endMinute: 10,
		// biome-ignore lint/suspicious/noExplicitAny: Test data
	} as any); // evt_00 < evt_01

	const result = mergeAvailability(initialSlots, [oldEvent], 'evt_01');
	expect(result).toEqual(initialSlots);
});
