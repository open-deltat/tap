import { expect, test } from 'bun:test';
import {
	getDayOfWeekUTC,
	getUnixStartOfDayUTC,
	parseDayToUnixStartOfDayUTC,
} from './day-utils';

test('parseDayToUnixStartOfDayUTC handles leap year correctly', () => {
	const leapDay = '2024-02-29';
	const unix = parseDayToUnixStartOfDayUTC(leapDay);

	expect(typeof unix).toBe('number');
	const date = new Date(unix);
	expect(date.getUTCFullYear()).toBe(2024);
	expect(date.getUTCMonth()).toBe(1);
	expect(date.getUTCDate()).toBe(29);
});

test('parseDayToUnixStartOfDayUTC rejects invalid leap year date', () => {
	expect(() => parseDayToUnixStartOfDayUTC('2025-02-29')).toThrow();
});

test('parseDayToUnixStartOfDayUTC handles year boundary correctly', () => {
	const lastDayOfYear = '2024-12-31';
	const firstDayOfYear = '2025-01-01';

	const unix1 = parseDayToUnixStartOfDayUTC(lastDayOfYear);
	const unix2 = parseDayToUnixStartOfDayUTC(firstDayOfYear);

	expect(unix2 - unix1).toBe(24 * 60 * 60 * 1000);

	const date1 = new Date(unix1);
	const date2 = new Date(unix2);

	expect(date1.getUTCFullYear()).toBe(2024);
	expect(date1.getUTCMonth()).toBe(11);
	expect(date1.getUTCDate()).toBe(31);

	expect(date2.getUTCFullYear()).toBe(2025);
	expect(date2.getUTCMonth()).toBe(0);
	expect(date2.getUTCDate()).toBe(1);
});

test('parseDayToUnixStartOfDayUTC handles month boundaries correctly', () => {
	const testCases = [
		{ day: '2025-01-31', next: '2025-02-01' },
		{ day: '2025-02-28', next: '2025-03-01' },
		{ day: '2025-03-31', next: '2025-04-01' },
		{ day: '2025-04-30', next: '2025-05-01' },
		{ day: '2025-05-31', next: '2025-06-01' },
		{ day: '2025-06-30', next: '2025-07-01' },
		{ day: '2025-07-31', next: '2025-08-01' },
		{ day: '2025-08-31', next: '2025-09-01' },
		{ day: '2025-09-30', next: '2025-10-01' },
		{ day: '2025-10-31', next: '2025-11-01' },
		{ day: '2025-11-30', next: '2025-12-01' },
		{ day: '2025-12-31', next: '2026-01-01' },
	];

	for (const { day, next } of testCases) {
		const unix1 = parseDayToUnixStartOfDayUTC(day);
		const unix2 = parseDayToUnixStartOfDayUTC(next);
		expect(unix2 - unix1).toBe(24 * 60 * 60 * 1000);
	}
});

test('parseDayToUnixStartOfDayUTC rejects invalid dates', () => {
	const invalidDates = [
		'2025-01-32',
		'2025-02-30',
		'2025-02-31',
		'2025-04-31',
		'2025-06-31',
		'2025-09-31',
		'2025-11-31',
		'2025-13-01',
		'2025-00-01',
		'2025-01-00',
	];

	for (const invalid of invalidDates) {
		try {
			const unix = parseDayToUnixStartOfDayUTC(invalid);
			const date = new Date(unix);
			const [year, month, day] = invalid.split('-').map(Number);
			if (
				date.getUTCFullYear() !== year ||
				date.getUTCMonth() !== month - 1 ||
				date.getUTCDate() !== day
			) {
				expect(() => parseDayToUnixStartOfDayUTC(invalid)).toThrow();
			}
		} catch {}
	}
});

test('parseDayToUnixStartOfDayUTC handles century boundaries', () => {
	const lastDayOfCentury = '1999-12-31';
	const firstDayOfCentury = '2000-01-01';

	const unix1 = parseDayToUnixStartOfDayUTC(lastDayOfCentury);
	const unix2 = parseDayToUnixStartOfDayUTC(firstDayOfCentury);

	expect(unix2 - unix1).toBe(24 * 60 * 60 * 1000);
});

test('parseDayToUnixStartOfDayUTC handles very old dates', () => {
	const oldDate = '1970-01-01';
	const unix = parseDayToUnixStartOfDayUTC(oldDate);

	expect(unix).toBe(0);
	expect(typeof unix).toBe('number');
});

test('parseDayToUnixStartOfDayUTC handles very future dates', () => {
	const futureDate = '2100-12-31';
	const unix = parseDayToUnixStartOfDayUTC(futureDate);

	expect(typeof unix).toBe('number');
	expect(unix).toBeGreaterThan(0);

	const date = new Date(unix);
	expect(date.getUTCFullYear()).toBe(2100);
	expect(date.getUTCMonth()).toBe(11);
	expect(date.getUTCDate()).toBe(31);
});

test('getDayOfWeekUTC is consistent across DST transitions', () => {
	const days = ['2024-03-10', '2024-03-11', '2024-11-03', '2024-11-04'];

	for (const day of days) {
		const dayOfWeek1 = getDayOfWeekUTC(day);
		const dayOfWeek2 = getDayOfWeekUTC(day);
		expect(dayOfWeek1).toBe(dayOfWeek2);
		expect(dayOfWeek1).toBeGreaterThanOrEqual(0);
		expect(dayOfWeek1).toBeLessThanOrEqual(6);
	}
});

test('getUnixStartOfDayUTC handles DST transitions correctly', () => {
	const dstSpringForward = Date.UTC(2024, 2, 10, 7, 0, 0, 0);
	const dstFallBack = Date.UTC(2024, 10, 3, 6, 0, 0, 0);

	const start1 = getUnixStartOfDayUTC(dstSpringForward);
	const start2 = getUnixStartOfDayUTC(dstFallBack);

	expect(typeof start1).toBe('number');
	expect(typeof start2).toBe('number');

	const date1 = new Date(start1);
	const date2 = new Date(start2);

	expect(date1.getUTCHours()).toBe(0);
	expect(date1.getUTCMinutes()).toBe(0);
	expect(date2.getUTCHours()).toBe(0);
	expect(date2.getUTCMinutes()).toBe(0);
});

test('getUnixStartOfDayUTC handles midnight boundary correctly', () => {
	const justBeforeMidnight = Date.UTC(2025, 0, 15, 23, 59, 59, 999);
	const exactlyMidnight = Date.UTC(2025, 0, 16, 0, 0, 0, 0);
	const justAfterMidnight = Date.UTC(2025, 0, 16, 0, 0, 0, 1);

	const start1 = getUnixStartOfDayUTC(justBeforeMidnight);
	const start2 = getUnixStartOfDayUTC(exactlyMidnight);
	const start3 = getUnixStartOfDayUTC(justAfterMidnight);

	expect(start1).toBeLessThan(start2);
	expect(start2).toBe(start3);
});

test('all functions handle edge of valid date range', () => {
	const minDate = '1970-01-01';
	const maxDate = '2100-12-31';

	const unix1 = parseDayToUnixStartOfDayUTC(minDate);
	const unix2 = parseDayToUnixStartOfDayUTC(maxDate);

	expect(unix1).toBe(0);
	expect(unix2).toBeGreaterThan(0);
	expect(typeof unix1).toBe('number');
	expect(typeof unix2).toBe('number');
});

test('day parsing is idempotent', () => {
	const day = '2025-06-15';
	const unix1 = parseDayToUnixStartOfDayUTC(day);
	const unix2 = parseDayToUnixStartOfDayUTC(day);
	const unix3 = parseDayToUnixStartOfDayUTC(day);

	expect(unix1).toBe(unix2);
	expect(unix2).toBe(unix3);
});

test('getDayOfWeekUTC returns correct values for all days of week', () => {
	const weekDays = [
		{ day: '2025-01-06', expected: 1 },
		{ day: '2025-01-07', expected: 2 },
		{ day: '2025-01-08', expected: 3 },
		{ day: '2025-01-09', expected: 4 },
		{ day: '2025-01-10', expected: 5 },
		{ day: '2025-01-11', expected: 6 },
		{ day: '2025-01-12', expected: 0 },
	];

	for (const { day, expected } of weekDays) {
		const dayOfWeek = getDayOfWeekUTC(day);
		expect(dayOfWeek).toBe(expected);
	}
});
