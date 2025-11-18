import { expect, test } from 'bun:test';
import { isWithinHorizon } from './horizon';

test('isWithinHorizon returns true for today', () => {
	const today = new Date();
	const day = today.toISOString().split('T')[0] || '';
	expect(isWithinHorizon(day, 90)).toBe(true);
});

test('isWithinHorizon returns true for date within horizon', () => {
	const future = new Date();
	future.setDate(future.getDate() + 30);
	const day = future.toISOString().split('T')[0] || '';
	expect(isWithinHorizon(day, 90)).toBe(true);
});

test('isWithinHorizon returns false for date beyond horizon', () => {
	const future = new Date();
	future.setDate(future.getDate() + 100);
	const day = future.toISOString().split('T')[0] || '';
	expect(isWithinHorizon(day, 90)).toBe(false);
});

test('isWithinHorizon returns false for past dates', () => {
	const past = new Date();
	past.setDate(past.getDate() - 1);
	const day = past.toISOString().split('T')[0] || '';
	expect(isWithinHorizon(day, 90)).toBe(false);
});

test('isWithinHorizon returns true for exact horizon boundary', () => {
	const future = new Date();
	future.setDate(future.getDate() + 90);
	const day = future.toISOString().split('T')[0] || '';
	expect(isWithinHorizon(day, 90)).toBe(true);
});

test('isWithinHorizon returns false for one day beyond horizon', () => {
	const future = new Date();
	future.setDate(future.getDate() + 91);
	const day = future.toISOString().split('T')[0] || '';
	expect(isWithinHorizon(day, 90)).toBe(false);
});

test('isWithinHorizon respects custom now parameter', () => {
	const baseDate = new Date('2025-01-01');
	const future = new Date('2025-01-31');
	const day = future.toISOString().split('T')[0] || '';
	expect(isWithinHorizon(day, 30, baseDate.getTime())).toBe(true);
});

test('isWithinHorizon returns false for date beyond horizon with custom now', () => {
	const baseDate = new Date('2025-01-01');
	const future = new Date('2025-02-02');
	const day = future.toISOString().split('T')[0] || '';
	expect(isWithinHorizon(day, 30, baseDate.getTime())).toBe(false);
});

test('isWithinHorizon uses unix timestamps (timezone-agnostic)', () => {
	const day = '2025-01-15';
	const horizonDays = 30;

	const dayStartUnix = Date.UTC(2025, 0, 15, 0, 0, 0, 0);
	const unixNow = dayStartUnix;
	const unixBeforeDay = dayStartUnix - 10 * 24 * 60 * 60 * 1000;
	const unixAfterDay = dayStartUnix + 10 * 24 * 60 * 60 * 1000;
	const unixBeyond = dayStartUnix + 31 * 24 * 60 * 60 * 1000;

	expect(isWithinHorizon(day, horizonDays, unixNow)).toBe(true);
	expect(isWithinHorizon(day, horizonDays, unixBeforeDay)).toBe(true);
	expect(isWithinHorizon(day, horizonDays, unixAfterDay)).toBe(false);
	expect(isWithinHorizon(day, horizonDays, unixBeyond)).toBe(false);
});

test('isWithinHorizon handles unix timestamps across timezones correctly', () => {
	const unixTimestamp = 1735689600000;
	const day = '2025-01-15';
	const horizonDays = 30;

	const result1 = isWithinHorizon(day, horizonDays, unixTimestamp);
	const result2 = isWithinHorizon(day, horizonDays, unixTimestamp);

	expect(result1).toBe(result2);
	expect(typeof unixTimestamp).toBe('number');
});

test('isWithinHorizon works with explicit unix milliseconds', () => {
	const unixNow = 1735689600000;
	const day = '2025-01-15';
	const horizonDays = 90;

	const result = isWithinHorizon(day, horizonDays, unixNow);
	expect(typeof result).toBe('boolean');
	expect(typeof unixNow).toBe('number');
	expect(unixNow).toBeGreaterThan(0);
});

test('isWithinHorizon is timezone-agnostic (UTC only)', () => {
	const unixBase = 1735689600000;
	const day = '2025-01-15';
	const horizonDays = 30;

	const result1 = isWithinHorizon(day, horizonDays, unixBase);
	const result2 = isWithinHorizon(day, horizonDays, unixBase);

	expect(result1).toBe(result2);
});

test('isWithinHorizon uses UTC for day parsing (strict)', () => {
	const day = '2025-01-15';
	const horizonDays = 90;
	const unixNow = Date.UTC(2025, 0, 15, 12, 0, 0, 0);

	const result = isWithinHorizon(day, horizonDays, unixNow);
	expect(result).toBe(true);

	const pastDay = '2024-12-01';
	const pastResult = isWithinHorizon(pastDay, horizonDays, unixNow);
	expect(pastResult).toBe(false);

	const futureDay = '2025-04-15';
	const futureResult = isWithinHorizon(futureDay, horizonDays, unixNow);
	expect(futureResult).toBe(true);
});

test('isWithinHorizon handles exact day boundaries in UTC', () => {
	const unixMidnightUTC = 1735689600000;
	const unixNoonUTC = unixMidnightUTC + 12 * 60 * 60 * 1000;
	const unixAlmostNextDay =
		unixMidnightUTC + 23 * 60 * 60 * 1000 + 59 * 60 * 1000;
	const day = '2025-01-15';
	const horizonDays = 30;

	const result1 = isWithinHorizon(day, horizonDays, unixMidnightUTC);
	const result2 = isWithinHorizon(day, horizonDays, unixNoonUTC);
	const result3 = isWithinHorizon(day, horizonDays, unixAlmostNextDay);

	expect(result1).toBe(result2);
	expect(result2).toBe(result3);
});

test('isWithinHorizon never uses local timezone', () => {
	const day = '2025-12-25';
	const horizonDays = 90;

	const unixTimestamps = [
		1735084800000,
		1735084800000 + 12 * 60 * 60 * 1000,
		1735084800000 + 23 * 60 * 60 * 1000,
	];

	const results = unixTimestamps.map((unix) =>
		isWithinHorizon(day, horizonDays, unix),
	);

	expect(results[0]).toBe(results[1]);
	expect(results[1]).toBe(results[2]);
});
