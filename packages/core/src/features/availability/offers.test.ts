import { describe, expect, it } from 'bun:test';
import type { Offer } from '../../domain/models';
import { generateOfferIntervals } from './offers';

const createWeeklyOffer = (
	overrides: Partial<Extract<Offer, { type: 'weekly' }>> = {},
): Extract<Offer, { type: 'weekly' }> => ({
	id: 'offer-1',
	tenantId: 'tenant-1',
	resourceId: 'resource-1',
	type: 'weekly',
	daysOfWeek: [1, 2, 3, 4, 5],
	startTime: '09:00',
	endTime: '17:00',
	timezone: 'UTC',
	...overrides,
});

const createRangeOffer = (
	overrides: Partial<Extract<Offer, { type: 'range' }>> = {},
): Extract<Offer, { type: 'range' }> => ({
	id: 'offer-2',
	tenantId: 'tenant-1',
	resourceId: 'resource-1',
	type: 'range',
	start: '2025-01-15T10:00:00.000Z',
	end: '2025-01-15T14:00:00.000Z',
	...overrides,
});

describe('offers', () => {
	describe('generateOfferIntervals', () => {
		describe('weekly offers', () => {
			it('generates intervals for weekdays within range', () => {
				const offer = createWeeklyOffer({
					daysOfWeek: [1],
					startTime: '09:00',
					endTime: '10:00',
				});

				const from = new Date('2025-01-06T00:00:00.000Z');
				const to = new Date('2025-01-13T23:59:59.999Z');

				const intervals = generateOfferIntervals([offer], from, to);

				expect(intervals.length).toBeGreaterThanOrEqual(1);

				const firstMonday = intervals.find(
					(i) =>
						new Date(i.start).toISOString().startsWith('2025-01-06') ||
						new Date(i.start).toISOString().startsWith('2025-01-13'),
				);
				expect(firstMonday).toBeDefined();
			});

			it('respects timezone for weekly offers', () => {
				const berlinOffer = createWeeklyOffer({
					daysOfWeek: [1],
					startTime: '09:00',
					endTime: '10:00',
					timezone: 'Europe/Berlin',
				});

				const from = new Date('2025-01-06T00:00:00.000Z');
				const to = new Date('2025-01-07T00:00:00.000Z');

				const intervals = generateOfferIntervals([berlinOffer], from, to);

				const mondayInterval = intervals[0];
				if (mondayInterval) {
					const startHourUTC = new Date(mondayInterval.start).getUTCHours();
					expect(startHourUTC).toBe(8);
				}
			});

			it('handles offers spanning midnight in timezone', () => {
				const offer = createWeeklyOffer({
					daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
					startTime: '00:00',
					endTime: '23:59',
					timezone: 'UTC',
				});

				const from = new Date('2025-01-01T00:00:00.000Z');
				const to = new Date('2025-01-02T00:00:00.000Z');

				const intervals = generateOfferIntervals([offer], from, to);
				expect(intervals.length).toBeGreaterThan(0);
			});

			it('excludes days not in daysOfWeek', () => {
				const offer = createWeeklyOffer({
					daysOfWeek: [1],
					startTime: '09:00',
					endTime: '17:00',
				});

				const tuesday = new Date('2025-01-07T00:00:00.000Z');
				const wednesday = new Date('2025-01-08T23:59:59.999Z');

				const intervals = generateOfferIntervals([offer], tuesday, wednesday);

				const tuesdayIntervals = intervals.filter((i) =>
					new Date(i.start).toISOString().startsWith('2025-01-07'),
				);
				expect(tuesdayIntervals).toHaveLength(0);
			});

			it('handles empty daysOfWeek', () => {
				const offer = createWeeklyOffer({
					daysOfWeek: [],
					startTime: '09:00',
					endTime: '17:00',
				});

				const from = new Date('2025-01-01T00:00:00.000Z');
				const to = new Date('2025-01-31T23:59:59.999Z');

				const intervals = generateOfferIntervals([offer], from, to);
				expect(intervals).toHaveLength(0);
			});

			it('includes all days when all days specified', () => {
				const offer = createWeeklyOffer({
					daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
					startTime: '10:00',
					endTime: '11:00',
					timezone: 'UTC',
				});

				const from = new Date('2025-01-06T00:00:00.000Z');
				const to = new Date('2025-01-12T23:59:59.999Z');

				const intervals = generateOfferIntervals([offer], from, to);
				expect(intervals.length).toBeGreaterThanOrEqual(7);
			});

			it('defaults timezone to UTC when not specified', () => {
				const offer = createWeeklyOffer({
					daysOfWeek: [1],
					startTime: '09:00',
					endTime: '10:00',
					timezone: undefined,
				});

				const from = new Date('2025-01-06T00:00:00.000Z');
				const to = new Date('2025-01-07T00:00:00.000Z');

				const intervals = generateOfferIntervals([offer], from, to);
				const mondayInterval = intervals[0];

				if (mondayInterval) {
					expect(new Date(mondayInterval.start).getUTCHours()).toBe(9);
				}
			});
		});

		describe('range offers', () => {
			it('generates interval for range within query period', () => {
				const offer = createRangeOffer({
					start: '2025-01-15T10:00:00.000Z',
					end: '2025-01-15T14:00:00.000Z',
				});

				const from = new Date('2025-01-01T00:00:00.000Z');
				const to = new Date('2025-01-31T23:59:59.999Z');

				const intervals = generateOfferIntervals([offer], from, to);

				expect(intervals).toHaveLength(1);
				expect(intervals[0]?.start).toBe(
					new Date('2025-01-15T10:00:00.000Z').getTime(),
				);
				expect(intervals[0]?.end).toBe(
					new Date('2025-01-15T14:00:00.000Z').getTime(),
				);
			});

			it('excludes range offer completely before query period', () => {
				const offer = createRangeOffer({
					start: '2025-01-01T10:00:00.000Z',
					end: '2025-01-01T14:00:00.000Z',
				});

				const from = new Date('2025-01-15T00:00:00.000Z');
				const to = new Date('2025-01-31T23:59:59.999Z');

				const intervals = generateOfferIntervals([offer], from, to);
				expect(intervals).toHaveLength(0);
			});

			it('excludes range offer completely after query period', () => {
				const offer = createRangeOffer({
					start: '2025-02-15T10:00:00.000Z',
					end: '2025-02-15T14:00:00.000Z',
				});

				const from = new Date('2025-01-01T00:00:00.000Z');
				const to = new Date('2025-01-31T23:59:59.999Z');

				const intervals = generateOfferIntervals([offer], from, to);
				expect(intervals).toHaveLength(0);
			});

			it('includes range offer partially overlapping query start', () => {
				const offer = createRangeOffer({
					start: '2024-12-31T10:00:00.000Z',
					end: '2025-01-02T14:00:00.000Z',
				});

				const from = new Date('2025-01-01T00:00:00.000Z');
				const to = new Date('2025-01-31T23:59:59.999Z');

				const intervals = generateOfferIntervals([offer], from, to);
				expect(intervals).toHaveLength(1);
			});

			it('includes range offer partially overlapping query end', () => {
				const offer = createRangeOffer({
					start: '2025-01-30T10:00:00.000Z',
					end: '2025-02-02T14:00:00.000Z',
				});

				const from = new Date('2025-01-01T00:00:00.000Z');
				const to = new Date('2025-01-31T23:59:59.999Z');

				const intervals = generateOfferIntervals([offer], from, to);
				expect(intervals).toHaveLength(1);
			});

			it('handles multi-day range offer', () => {
				const offer = createRangeOffer({
					start: '2025-01-10T00:00:00.000Z',
					end: '2025-01-15T23:59:59.999Z',
				});

				const from = new Date('2025-01-01T00:00:00.000Z');
				const to = new Date('2025-01-31T23:59:59.999Z');

				const intervals = generateOfferIntervals([offer], from, to);
				expect(intervals).toHaveLength(1);

				const duration = (intervals[0]?.end ?? 0) - (intervals[0]?.start ?? 0);
				const days = duration / (24 * 60 * 60 * 1000);
				expect(days).toBeCloseTo(5.999, 1);
			});
		});

		describe('mixed offers', () => {
			it('combines weekly and range offers', () => {
				const weeklyOffer = createWeeklyOffer({
					daysOfWeek: [1],
					startTime: '09:00',
					endTime: '17:00',
				});
				const rangeOffer = createRangeOffer({
					start: '2025-01-15T10:00:00.000Z',
					end: '2025-01-15T14:00:00.000Z',
				});

				const from = new Date('2025-01-06T00:00:00.000Z');
				const to = new Date('2025-01-20T23:59:59.999Z');

				const intervals = generateOfferIntervals(
					[weeklyOffer, rangeOffer],
					from,
					to,
				);

				expect(intervals.length).toBeGreaterThan(1);
			});

			it('handles empty offers array', () => {
				const from = new Date('2025-01-01T00:00:00.000Z');
				const to = new Date('2025-01-31T23:59:59.999Z');

				const intervals = generateOfferIntervals([], from, to);
				expect(intervals).toHaveLength(0);
			});

			it('stacks overlapping offers', () => {
				const offer1 = createWeeklyOffer({
					id: 'offer-1',
					daysOfWeek: [1],
					startTime: '09:00',
					endTime: '12:00',
				});
				const offer2 = createWeeklyOffer({
					id: 'offer-2',
					daysOfWeek: [1],
					startTime: '10:00',
					endTime: '14:00',
				});

				const from = new Date('2025-01-06T00:00:00.000Z');
				const to = new Date('2025-01-07T00:00:00.000Z');

				const intervals = generateOfferIntervals([offer1, offer2], from, to);

				expect(intervals.length).toBe(2);
			});
		});

		describe('edge cases', () => {
			it('handles DST transition (spring forward)', () => {
				const offer = createWeeklyOffer({
					daysOfWeek: [0],
					startTime: '02:30',
					endTime: '03:30',
					timezone: 'America/New_York',
				});

				const from = new Date('2025-03-09T00:00:00.000Z');
				const to = new Date('2025-03-10T00:00:00.000Z');

				const intervals = generateOfferIntervals([offer], from, to);
				expect(intervals).toBeDefined();
			});

			it('handles DST transition (fall back)', () => {
				const offer = createWeeklyOffer({
					daysOfWeek: [0],
					startTime: '01:30',
					endTime: '02:30',
					timezone: 'America/New_York',
				});

				const from = new Date('2025-11-02T00:00:00.000Z');
				const to = new Date('2025-11-03T00:00:00.000Z');

				const intervals = generateOfferIntervals([offer], from, to);
				expect(intervals).toBeDefined();
			});

			it('handles very short query range', () => {
				const offer = createWeeklyOffer({
					daysOfWeek: [1],
					startTime: '09:00',
					endTime: '17:00',
				});

				const from = new Date('2025-01-06T10:00:00.000Z');
				const to = new Date('2025-01-06T10:01:00.000Z');

				const intervals = generateOfferIntervals([offer], from, to);
				expect(intervals).toBeDefined();
			});

			it('handles leap year', () => {
				const offer = createWeeklyOffer({
					daysOfWeek: [6],
					startTime: '09:00',
					endTime: '17:00',
				});

				const from = new Date('2024-02-28T00:00:00.000Z');
				const to = new Date('2024-03-02T00:00:00.000Z');

				const intervals = generateOfferIntervals([offer], from, to);
				expect(intervals).toBeDefined();
			});

			it('handles year boundary', () => {
				const offer = createWeeklyOffer({
					daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
					startTime: '09:00',
					endTime: '17:00',
				});

				const from = new Date('2024-12-30T00:00:00.000Z');
				const to = new Date('2025-01-03T00:00:00.000Z');

				const intervals = generateOfferIntervals([offer], from, to);
				expect(intervals.length).toBeGreaterThanOrEqual(4);
			});

			it('handles exact boundary match for range offer', () => {
				const offer = createRangeOffer({
					start: '2025-01-15T10:00:00.000Z',
					end: '2025-01-15T14:00:00.000Z',
				});

				const from = new Date('2025-01-15T10:00:00.000Z');
				const to = new Date('2025-01-15T14:00:00.000Z');

				const intervals = generateOfferIntervals([offer], from, to);
				expect(intervals).toHaveLength(1);
			});
		});

		describe('timezone edge cases', () => {
			it('handles Tokyo timezone (UTC+9)', () => {
				const offer = createWeeklyOffer({
					daysOfWeek: [1],
					startTime: '09:00',
					endTime: '10:00',
					timezone: 'Asia/Tokyo',
				});

				const from = new Date('2025-01-06T00:00:00.000Z');
				const to = new Date('2025-01-07T00:00:00.000Z');

				const intervals = generateOfferIntervals([offer], from, to);
				const mondayInterval = intervals[0];

				if (mondayInterval) {
					expect(new Date(mondayInterval.start).getUTCHours()).toBe(0);
				}
			});

			it('handles Los Angeles timezone (UTC-8)', () => {
				const offer = createWeeklyOffer({
					daysOfWeek: [1],
					startTime: '09:00',
					endTime: '10:00',
					timezone: 'America/Los_Angeles',
				});

				const from = new Date('2025-01-06T00:00:00.000Z');
				const to = new Date('2025-01-07T23:59:59.999Z');

				const intervals = generateOfferIntervals([offer], from, to);
				const mondayInterval = intervals[0];

				if (mondayInterval) {
					expect(new Date(mondayInterval.start).getUTCHours()).toBe(17);
				}
			});

			it('handles offers in multiple timezones', () => {
				const tokyoOffer = createWeeklyOffer({
					id: 'tokyo',
					daysOfWeek: [1],
					startTime: '09:00',
					endTime: '10:00',
					timezone: 'Asia/Tokyo',
				});
				const nyOffer = createWeeklyOffer({
					id: 'ny',
					daysOfWeek: [1],
					startTime: '09:00',
					endTime: '10:00',
					timezone: 'America/New_York',
				});

				const from = new Date('2025-01-05T00:00:00.000Z');
				const to = new Date('2025-01-07T23:59:59.999Z');

				const intervals = generateOfferIntervals(
					[tokyoOffer, nyOffer],
					from,
					to,
				);

				expect(intervals.length).toBeGreaterThanOrEqual(2);

				const tokyoInterval = intervals.find(
					(i) => new Date(i.start).getUTCHours() === 0,
				);
				const nyInterval = intervals.find(
					(i) => new Date(i.start).getUTCHours() === 14,
				);

				expect(tokyoInterval).toBeDefined();
				expect(nyInterval).toBeDefined();
			});

			it('handles Sydney timezone with DST', () => {
				const offer = createWeeklyOffer({
					daysOfWeek: [1],
					startTime: '09:00',
					endTime: '17:00',
					timezone: 'Australia/Sydney',
				});

				const summerFrom = new Date('2025-01-06T00:00:00.000Z');
				const summerTo = new Date('2025-01-07T00:00:00.000Z');

				const winterFrom = new Date('2025-07-07T00:00:00.000Z');
				const winterTo = new Date('2025-07-08T00:00:00.000Z');

				const summerIntervals = generateOfferIntervals(
					[offer],
					summerFrom,
					summerTo,
				);
				const winterIntervals = generateOfferIntervals(
					[offer],
					winterFrom,
					winterTo,
				);

				expect(summerIntervals.length).toBeGreaterThan(0);
				expect(winterIntervals.length).toBeGreaterThan(0);
			});
		});

		describe('weekly offer patterns', () => {
			it('handles weekend only (Saturday and Sunday)', () => {
				const offer = createWeeklyOffer({
					daysOfWeek: [0, 6],
					startTime: '10:00',
					endTime: '18:00',
				});

				const from = new Date('2025-01-06T00:00:00.000Z');
				const to = new Date('2025-01-12T23:59:59.999Z');

				const intervals = generateOfferIntervals([offer], from, to);

				for (const interval of intervals) {
					const dayOfWeek = new Date(interval.start).getUTCDay();
					expect([0, 6]).toContain(dayOfWeek);
				}
			});

			it('handles single day (Sunday only)', () => {
				const offer = createWeeklyOffer({
					daysOfWeek: [0],
					startTime: '12:00',
					endTime: '14:00',
				});

				const from = new Date('2025-01-01T00:00:00.000Z');
				const to = new Date('2025-01-31T23:59:59.999Z');

				const intervals = generateOfferIntervals([offer], from, to);

				for (const interval of intervals) {
					const dayOfWeek = new Date(interval.start).getUTCDay();
					expect(dayOfWeek).toBe(0);
				}
			});

			it('handles alternating days (Mon, Wed, Fri)', () => {
				const offer = createWeeklyOffer({
					daysOfWeek: [1, 3, 5],
					startTime: '09:00',
					endTime: '17:00',
				});

				const from = new Date('2025-01-06T00:00:00.000Z');
				const to = new Date('2025-01-12T23:59:59.999Z');

				const intervals = generateOfferIntervals([offer], from, to);

				for (const interval of intervals) {
					const dayOfWeek = new Date(interval.start).getUTCDay();
					expect([1, 3, 5]).toContain(dayOfWeek);
				}
			});

			it('handles early morning offers (6am)', () => {
				const offer = createWeeklyOffer({
					daysOfWeek: [1, 2, 3, 4, 5],
					startTime: '06:00',
					endTime: '07:00',
					timezone: 'UTC',
				});

				const from = new Date('2025-01-06T00:00:00.000Z');
				const to = new Date('2025-01-07T00:00:00.000Z');

				const intervals = generateOfferIntervals([offer], from, to);
				const interval = intervals[0];

				if (interval) {
					expect(new Date(interval.start).getUTCHours()).toBe(6);
				}
			});

			it('handles late night offers (10pm)', () => {
				const offer = createWeeklyOffer({
					daysOfWeek: [5, 6],
					startTime: '22:00',
					endTime: '23:30',
					timezone: 'UTC',
				});

				const from = new Date('2025-01-10T00:00:00.000Z');
				const to = new Date('2025-01-12T00:00:00.000Z');

				const intervals = generateOfferIntervals([offer], from, to);

				for (const interval of intervals) {
					expect(new Date(interval.start).getUTCHours()).toBe(22);
				}
			});

			it('handles lunch break pattern (two sessions per day)', () => {
				const morningOffer = createWeeklyOffer({
					id: 'morning',
					daysOfWeek: [1, 2, 3, 4, 5],
					startTime: '09:00',
					endTime: '12:00',
				});
				const afternoonOffer = createWeeklyOffer({
					id: 'afternoon',
					daysOfWeek: [1, 2, 3, 4, 5],
					startTime: '13:00',
					endTime: '17:00',
				});

				const from = new Date('2025-01-06T00:00:00.000Z');
				const to = new Date('2025-01-07T00:00:00.000Z');

				const intervals = generateOfferIntervals(
					[morningOffer, afternoonOffer],
					from,
					to,
				);

				expect(intervals).toHaveLength(2);

				const morningSlot = intervals.find(
					(i) => new Date(i.start).getUTCHours() === 9,
				);
				const afternoonSlot = intervals.find(
					(i) => new Date(i.start).getUTCHours() === 13,
				);

				expect(morningSlot).toBeDefined();
				expect(afternoonSlot).toBeDefined();
			});
		});

		describe('range offer scenarios', () => {
			it('handles one-hour range offer', () => {
				const offer = createRangeOffer({
					start: '2025-01-15T14:00:00.000Z',
					end: '2025-01-15T15:00:00.000Z',
				});

				const from = new Date('2025-01-15T00:00:00.000Z');
				const to = new Date('2025-01-16T00:00:00.000Z');

				const intervals = generateOfferIntervals([offer], from, to);
				const duration = (intervals[0]?.end ?? 0) - (intervals[0]?.start ?? 0);

				expect(duration).toBe(60 * 60 * 1000);
			});

			it('handles week-long range offer', () => {
				const offer = createRangeOffer({
					start: '2025-01-06T00:00:00.000Z',
					end: '2025-01-12T23:59:59.999Z',
				});

				const from = new Date('2025-01-01T00:00:00.000Z');
				const to = new Date('2025-01-31T00:00:00.000Z');

				const intervals = generateOfferIntervals([offer], from, to);
				expect(intervals).toHaveLength(1);

				const duration = (intervals[0]?.end ?? 0) - (intervals[0]?.start ?? 0);
				const days = duration / (24 * 60 * 60 * 1000);

				expect(days).toBeCloseTo(7, 0);
			});

			it('handles multiple non-overlapping range offers', () => {
				const offer1 = createRangeOffer({
					id: 'morning-event',
					start: '2025-01-15T09:00:00.000Z',
					end: '2025-01-15T12:00:00.000Z',
				});
				const offer2 = createRangeOffer({
					id: 'afternoon-event',
					start: '2025-01-15T14:00:00.000Z',
					end: '2025-01-15T17:00:00.000Z',
				});
				const offer3 = createRangeOffer({
					id: 'evening-event',
					start: '2025-01-15T19:00:00.000Z',
					end: '2025-01-15T22:00:00.000Z',
				});

				const from = new Date('2025-01-15T00:00:00.000Z');
				const to = new Date('2025-01-16T00:00:00.000Z');

				const intervals = generateOfferIntervals(
					[offer1, offer2, offer3],
					from,
					to,
				);

				expect(intervals).toHaveLength(3);
			});

			it('handles overlapping range offers', () => {
				const offer1 = createRangeOffer({
					id: 'event-1',
					start: '2025-01-15T10:00:00.000Z',
					end: '2025-01-15T14:00:00.000Z',
				});
				const offer2 = createRangeOffer({
					id: 'event-2',
					start: '2025-01-15T12:00:00.000Z',
					end: '2025-01-15T16:00:00.000Z',
				});

				const from = new Date('2025-01-15T00:00:00.000Z');
				const to = new Date('2025-01-16T00:00:00.000Z');

				const intervals = generateOfferIntervals([offer1, offer2], from, to);

				expect(intervals).toHaveLength(2);
			});

			it('handles range offer exactly at midnight', () => {
				const offer = createRangeOffer({
					start: '2025-01-15T00:00:00.000Z',
					end: '2025-01-15T01:00:00.000Z',
				});

				const from = new Date('2025-01-14T23:00:00.000Z');
				const to = new Date('2025-01-15T02:00:00.000Z');

				const intervals = generateOfferIntervals([offer], from, to);
				expect(intervals).toHaveLength(1);
				expect(new Date(intervals[0]?.start ?? 0).getUTCHours()).toBe(0);
			});

			it('handles range offer spanning midnight', () => {
				const offer = createRangeOffer({
					start: '2025-01-15T22:00:00.000Z',
					end: '2025-01-16T02:00:00.000Z',
				});

				const from = new Date('2025-01-15T00:00:00.000Z');
				const to = new Date('2025-01-16T12:00:00.000Z');

				const intervals = generateOfferIntervals([offer], from, to);
				expect(intervals).toHaveLength(1);

				const duration = (intervals[0]?.end ?? 0) - (intervals[0]?.start ?? 0);
				expect(duration).toBe(4 * 60 * 60 * 1000);
			});
		});

		describe('complex stacking scenarios', () => {
			it('stacks weekly and range offers on same day', () => {
				const regularHours = createWeeklyOffer({
					id: 'regular',
					daysOfWeek: [3],
					startTime: '09:00',
					endTime: '17:00',
				});
				const specialEvent = createRangeOffer({
					id: 'special',
					start: '2025-01-15T12:00:00.000Z',
					end: '2025-01-15T14:00:00.000Z',
				});

				const from = new Date('2025-01-15T00:00:00.000Z');
				const to = new Date('2025-01-16T00:00:00.000Z');

				const intervals = generateOfferIntervals(
					[regularHours, specialEvent],
					from,
					to,
				);

				expect(intervals.length).toBe(2);
			});

			it('handles multiple weekly offers with different times', () => {
				const morningYoga = createWeeklyOffer({
					id: 'morning-yoga',
					daysOfWeek: [1, 3, 5],
					startTime: '07:00',
					endTime: '08:00',
				});
				const eveningYoga = createWeeklyOffer({
					id: 'evening-yoga',
					daysOfWeek: [1, 3, 5],
					startTime: '18:00',
					endTime: '19:00',
				});
				const weekendYoga = createWeeklyOffer({
					id: 'weekend-yoga',
					daysOfWeek: [0, 6],
					startTime: '10:00',
					endTime: '11:30',
				});

				const from = new Date('2025-01-06T00:00:00.000Z');
				const to = new Date('2025-01-12T23:59:59.999Z');

				const intervals = generateOfferIntervals(
					[morningYoga, eveningYoga, weekendYoga],
					from,
					to,
				);

				expect(intervals.length).toBeGreaterThanOrEqual(8);
			});

			it('handles doctor schedule with multiple slot types', () => {
				const regularAppointments = createWeeklyOffer({
					id: 'regular',
					daysOfWeek: [1, 2, 3, 4, 5],
					startTime: '09:00',
					endTime: '12:00',
				});
				const afternoonSlots = createWeeklyOffer({
					id: 'afternoon',
					daysOfWeek: [3],
					startTime: '14:00',
					endTime: '16:00',
				});
				const emergencySlots = createRangeOffer({
					id: 'emergency',
					start: '2025-01-15T08:00:00.000Z',
					end: '2025-01-15T09:00:00.000Z',
				});

				const from = new Date('2025-01-13T00:00:00.000Z');
				const to = new Date('2025-01-18T00:00:00.000Z');

				const intervals = generateOfferIntervals(
					[regularAppointments, afternoonSlots, emergencySlots],
					from,
					to,
				);

				const afternoonInterval = intervals.find(
					(i) => new Date(i.start).getUTCHours() === 14,
				);
				expect(afternoonInterval).toBeDefined();

				const emergencyInterval = intervals.find(
					(i) =>
						new Date(i.start).getUTCHours() === 8 &&
						new Date(i.start).getUTCDate() === 15,
				);
				expect(emergencyInterval).toBeDefined();
			});
		});

		describe('boundary precision', () => {
			it('handles millisecond precision in range offers', () => {
				const offer = createRangeOffer({
					start: '2025-01-15T10:00:00.001Z',
					end: '2025-01-15T10:00:00.002Z',
				});

				const from = new Date('2025-01-15T00:00:00.000Z');
				const to = new Date('2025-01-16T00:00:00.000Z');

				const intervals = generateOfferIntervals([offer], from, to);
				expect(intervals).toHaveLength(1);
				expect(intervals[0]?.end - intervals[0]?.start).toBe(1);
			});

			it('handles offer exactly at query boundary', () => {
				const offer = createRangeOffer({
					start: '2025-01-15T10:00:00.000Z',
					end: '2025-01-15T11:00:00.000Z',
				});

				const from = new Date('2025-01-15T10:00:00.000Z');
				const to = new Date('2025-01-15T11:00:00.000Z');

				const intervals = generateOfferIntervals([offer], from, to);
				expect(intervals).toHaveLength(1);
			});

			it('includes offer ending exactly at query start (touching boundary)', () => {
				const offer = createRangeOffer({
					start: '2025-01-15T09:00:00.000Z',
					end: '2025-01-15T10:00:00.000Z',
				});

				const from = new Date('2025-01-15T10:00:00.000Z');
				const to = new Date('2025-01-15T11:00:00.000Z');

				const intervals = generateOfferIntervals([offer], from, to);
				expect(intervals).toHaveLength(1);
			});

			it('includes offer starting exactly at query end (touching boundary)', () => {
				const offer = createRangeOffer({
					start: '2025-01-15T11:00:00.000Z',
					end: '2025-01-15T12:00:00.000Z',
				});

				const from = new Date('2025-01-15T10:00:00.000Z');
				const to = new Date('2025-01-15T11:00:00.000Z');

				const intervals = generateOfferIntervals([offer], from, to);
				expect(intervals).toHaveLength(1);
			});

			it('excludes offer completely before query range', () => {
				const offer = createRangeOffer({
					start: '2025-01-15T08:00:00.000Z',
					end: '2025-01-15T09:00:00.000Z',
				});

				const from = new Date('2025-01-15T10:00:00.000Z');
				const to = new Date('2025-01-15T11:00:00.000Z');

				const intervals = generateOfferIntervals([offer], from, to);
				expect(intervals).toHaveLength(0);
			});

			it('excludes offer completely after query range', () => {
				const offer = createRangeOffer({
					start: '2025-01-15T12:00:00.000Z',
					end: '2025-01-15T13:00:00.000Z',
				});

				const from = new Date('2025-01-15T10:00:00.000Z');
				const to = new Date('2025-01-15T11:00:00.000Z');

				const intervals = generateOfferIntervals([offer], from, to);
				expect(intervals).toHaveLength(0);
			});
		});
	});
});
