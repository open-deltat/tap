import type { AllocatorState, DayKey, Minute, Offer } from '@tap/core';
import { getAvailableMinutesFromOffers, isRangeFree } from '@tap/core';
import type { AvailabilitySlot } from '../types';

export const getAvailability = (params: {
	state: AllocatorState;
	day: DayKey;
	offers?: Offer[];
	fromMinute?: Minute;
	toMinute?: Minute;
	durationMinutes?: number;
}): AvailabilitySlot[] => {
	const {
		state,
		day,
		offers = [],
		fromMinute = 0,
		toMinute = 1440,
		durationMinutes = 60,
	} = params;

	const dayState = state.get(day);
	const availableMinutesFromOffers =
		offers.length > 0
			? getAvailableMinutesFromOffers(day, offers)
			: new Set<Minute>();

	const slots: AvailabilitySlot[] = [];
	const dayStart = new Date(day).setHours(0, 0, 0, 0);

	let currentStart = fromMinute;

	while (currentStart + durationMinutes <= toMinute) {
		const currentEnd = currentStart + durationMinutes;

		const isInOfferRange =
			offers.length === 0 ||
			(availableMinutesFromOffers.has(currentStart) &&
				availableMinutesFromOffers.has(currentEnd - 1));

		if (
			isInOfferRange &&
			dayState &&
			isRangeFree(dayState.booked, dayState.held, currentStart, currentEnd)
		) {
			slots.push({
				start: dayStart + currentStart * 60 * 1000,
				end: dayStart + currentEnd * 60 * 1000,
			});
		}

		currentStart += 15;
	}

	return slots;
};
