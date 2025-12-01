import { fromZonedTime } from 'date-fns-tz';
import type { Offer } from '../../domain/models';
import type { Interval } from '../../infrastructure/intervals';

const DAY_MS = 24 * 60 * 60 * 1000;

const generateRangeOfferInterval = (
	offer: Extract<Offer, { type: 'range' }>,
	from: Date,
	to: Date,
): Interval | null => {
	const start = new Date(offer.start).getTime();
	const end = new Date(offer.end).getTime();

	if (end < from.getTime() || start > to.getTime()) return null;

	return { start, end, value: offer.capacity };
};

const getDayOfWeekInTimezone = (
	timestamp: number,
	timezone: string,
): number => {
	const isoDate = new Date(timestamp).toLocaleDateString('en-CA', {
		timeZone: timezone,
	});
	return new Date(isoDate).getUTCDay();
};

const generateWeeklyOfferIntervals = (
	offer: Extract<Offer, { type: 'weekly' }>,
	from: Date,
	to: Date,
): Interval[] => {
	const timezone = offer.timezone || 'UTC';
	const intervals: Interval[] = [];

	const startIter = from.getTime() - DAY_MS;
	const endIter = to.getTime() + DAY_MS;

	for (let timestamp = startIter; timestamp <= endIter; timestamp += DAY_MS) {
		const isoDate = new Date(timestamp).toLocaleDateString('en-CA', {
			timeZone: timezone,
		});
		const dayOfWeek = getDayOfWeekInTimezone(timestamp, timezone);

		if (!offer.daysOfWeek.includes(dayOfWeek)) continue;

		const startUnix = fromZonedTime(
			`${isoDate}T${offer.startTime}:00`,
			timezone,
		).getTime();
		const endUnix = fromZonedTime(
			`${isoDate}T${offer.endTime}:00`,
			timezone,
		).getTime();

		if (endUnix < from.getTime() || startUnix > to.getTime()) continue;

		intervals.push({ start: startUnix, end: endUnix, value: offer.capacity });
	}

	return intervals;
};

export const generateOfferIntervals = (
	offers: Offer[],
	from: Date,
	to: Date,
): Interval[] => {
	const intervals: Interval[] = [];

	for (const offer of offers) {
		if (offer.type === 'range') {
			const interval = generateRangeOfferInterval(offer, from, to);
			if (interval) intervals.push(interval);
		} else if (offer.type === 'weekly') {
			intervals.push(...generateWeeklyOfferIntervals(offer, from, to));
		}
	}

	return intervals;
};
