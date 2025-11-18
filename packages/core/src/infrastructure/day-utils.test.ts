import { expect, test } from 'bun:test';
import {
	getDayOfWeekUTC,
	getUnixStartOfDayUTC,
	parseDayToUnixStartOfDayUTC,
} from './day-utils';

test('parseDayToUnixStartOfDayUTC returns unix timestamp for UTC midnight', () => {
	const day = '2025-12-25';
	const unix = parseDayToUnixStartOfDayUTC(day);

	expect(typeof unix).toBe('number');
	expect(unix).toBeGreaterThan(0);

	const date = new Date(unix);
	expect(date.getUTCFullYear()).toBe(2025);
	expect(date.getUTCMonth()).toBe(11);
	expect(date.getUTCDate()).toBe(25);
	expect(date.getUTCHours()).toBe(0);
	expect(date.getUTCMinutes()).toBe(0);
	expect(date.getUTCSeconds()).toBe(0);
	expect(date.getUTCMilliseconds()).toBe(0);
});

test('parseDayToUnixStartOfDayUTC is timezone-agnostic', () => {
	const day = '2025-01-15';
	const unix1 = parseDayToUnixStartOfDayUTC(day);
	const unix2 = parseDayToUnixStartOfDayUTC(day);

	expect(unix1).toBe(unix2);
	expect(unix1).toBe(Date.UTC(2025, 0, 15, 0, 0, 0, 0));
});

test('parseDayToUnixStartOfDayUTC handles different days correctly', () => {
	const day1 = '2025-01-01';
	const day2 = '2025-01-02';
	const unix1 = parseDayToUnixStartOfDayUTC(day1);
	const unix2 = parseDayToUnixStartOfDayUTC(day2);

	expect(unix2 - unix1).toBe(24 * 60 * 60 * 1000);
});

test('parseDayToUnixStartOfDayUTC throws on invalid format', () => {
	expect(() => parseDayToUnixStartOfDayUTC('invalid')).toThrow();
	expect(() => parseDayToUnixStartOfDayUTC('2025-13-01')).toThrow();
});

test('getDayOfWeekUTC returns correct day of week in UTC', () => {
	const monday = '2025-01-06';
	const tuesday = '2025-01-07';
	const wednesday = '2025-01-08';

	expect(getDayOfWeekUTC(monday)).toBe(1);
	expect(getDayOfWeekUTC(tuesday)).toBe(2);
	expect(getDayOfWeekUTC(wednesday)).toBe(3);
});

test('getDayOfWeekUTC is timezone-agnostic', () => {
	const day = '2025-12-25';
	const dayOfWeek1 = getDayOfWeekUTC(day);
	const dayOfWeek2 = getDayOfWeekUTC(day);

	expect(dayOfWeek1).toBe(dayOfWeek2);
	expect(dayOfWeek1).toBeGreaterThanOrEqual(0);
	expect(dayOfWeek1).toBeLessThanOrEqual(6);
});

test('getUnixStartOfDayUTC returns unix timestamp for start of day in UTC', () => {
	const unixTimestamp = 1735689600000;
	const startOfDay = getUnixStartOfDayUTC(unixTimestamp);

	expect(typeof startOfDay).toBe('number');
	expect(startOfDay).toBeLessThanOrEqual(unixTimestamp);

	const date = new Date(startOfDay);
	expect(date.getUTCHours()).toBe(0);
	expect(date.getUTCMinutes()).toBe(0);
	expect(date.getUTCSeconds()).toBe(0);
	expect(date.getUTCMilliseconds()).toBe(0);
});

test('getUnixStartOfDayUTC is timezone-agnostic', () => {
	const unix1 = 1735689600000;
	const unix2 = 1735689600000 + 12 * 60 * 60 * 1000;
	const unix3 = 1735689600000 + 23 * 60 * 60 * 1000 + 59 * 60 * 1000;

	const start1 = getUnixStartOfDayUTC(unix1);
	const start2 = getUnixStartOfDayUTC(unix2);
	const start3 = getUnixStartOfDayUTC(unix3);

	expect(start1).toBe(start2);
	expect(start2).toBe(start3);
});

test('all functions return unix timestamps (numbers)', () => {
	const day = '2025-12-25';
	const unix = 1735689600000;

	expect(typeof parseDayToUnixStartOfDayUTC(day)).toBe('number');
	expect(typeof getUnixStartOfDayUTC(unix)).toBe('number');
	expect(typeof getDayOfWeekUTC(day)).toBe('number');
});

test('day parsing matches expected unix values', () => {
	const testCases = [
		{ day: '2025-01-01', expected: Date.UTC(2025, 0, 1, 0, 0, 0, 0) },
		{ day: '2025-12-25', expected: Date.UTC(2025, 11, 25, 0, 0, 0, 0) },
		{ day: '2024-01-01', expected: Date.UTC(2024, 0, 1, 0, 0, 0, 0) },
	];

	for (const { day, expected } of testCases) {
		const unix = parseDayToUnixStartOfDayUTC(day);
		expect(unix).toBe(expected);
	}
});
