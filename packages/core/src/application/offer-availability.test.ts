import { expect, test } from 'bun:test';
import type { Offer } from '../domain/schemas';
import { getAvailableMinutesFromOffers } from './offer-availability';

test('getAvailableMinutesFromOffers returns default 9-5 weekday when no offers', () => {
	const offers: Offer[] = [];
	const day = '2025-12-01';
	const dayDate = new Date(day);
	const dayOfWeek = dayDate.getDay();
	const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

	const result = getAvailableMinutesFromOffers(day, offers);

	if (isWeekday) {
		expect(result.size).toBeGreaterThan(0);
		expect(result.has(9 * 60)).toBe(true);
		expect(result.has(16 * 60 + 59)).toBe(true);
		expect(result.has(8 * 60)).toBe(false);
		expect(result.has(17 * 60)).toBe(false);
	} else {
		expect(result.size).toBe(0);
	}
});

test('getAvailableMinutesFromOffers returns minutes for matching day of week', () => {
	const offers: Offer[] = [
		{
			id: '01HZ123',
			tenantId: '01HZ456',
			resourceId: '01HZ789',
			daysOfWeek: [1],
			startTime: '09:00',
			endTime: '17:00',
			currency: 'USD',
		},
	];
	const day = '2025-12-01';
	const result = getAvailableMinutesFromOffers(day, offers);
	expect(result.size).toBeGreaterThan(0);
	expect(result.has(540)).toBe(true);
	expect(result.has(1019)).toBe(true);
});

test('getAvailableMinutesFromOffers excludes minutes outside offer hours', () => {
	const offers: Offer[] = [
		{
			id: '01HZ123',
			tenantId: '01HZ456',
			resourceId: '01HZ789',
			daysOfWeek: [1],
			startTime: '09:00',
			endTime: '17:00',
			currency: 'USD',
		},
	];
	const day = '2025-12-01';
	const result = getAvailableMinutesFromOffers(day, offers);
	expect(result.has(480)).toBe(false);
	expect(result.has(1020)).toBe(false);
});

test('getAvailableMinutesFromOffers returns empty set for non-matching day of week', () => {
	const offers: Offer[] = [
		{
			id: '01HZ123',
			tenantId: '01HZ456',
			resourceId: '01HZ789',
			daysOfWeek: [0],
			startTime: '09:00',
			endTime: '17:00',
			currency: 'USD',
		},
	];
	const day = '2025-12-01';
	const result = getAvailableMinutesFromOffers(day, offers);
	expect(result.size).toBe(0);
});

test('getAvailableMinutesFromOffers combines multiple offers', () => {
	const offers: Offer[] = [
		{
			id: '01HZ123',
			tenantId: '01HZ456',
			resourceId: '01HZ789',
			daysOfWeek: [1],
			startTime: '09:00',
			endTime: '12:00',
			currency: 'USD',
		},
		{
			id: '01HZ124',
			tenantId: '01HZ456',
			resourceId: '01HZ789',
			daysOfWeek: [1],
			startTime: '13:00',
			endTime: '17:00',
			currency: 'USD',
		},
	];
	const day = '2025-12-01';
	const result = getAvailableMinutesFromOffers(day, offers);
	expect(result.has(540)).toBe(true);
	expect(result.has(719)).toBe(true);
	expect(result.has(780)).toBe(true);
	expect(result.has(1019)).toBe(true);
	expect(result.has(720)).toBe(false);
	expect(result.has(779)).toBe(false);
});

test('getAvailableMinutesFromOffers handles partial hours correctly', () => {
	const offers: Offer[] = [
		{
			id: '01HZ123',
			tenantId: '01HZ456',
			resourceId: '01HZ789',
			daysOfWeek: [1],
			startTime: '09:30',
			endTime: '10:15',
			currency: 'USD',
		},
	];
	const day = '2025-12-01';
	const result = getAvailableMinutesFromOffers(day, offers);
	expect(result.has(570)).toBe(true);
	expect(result.has(614)).toBe(true);
	expect(result.has(615)).toBe(false);
});
