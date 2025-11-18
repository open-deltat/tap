import type { AllocatorState, DayKey, Minute, Offer } from '@tap/core';
import {
	getAvailableMinutesFromOffers,
	isRangeFree,
	parseDayToUnixStartOfDayUTC,
} from '@tap/core';
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
	const availableMinutesFromOffers = getAvailableMinutesFromOffers(day, offers);

	const slots: AvailabilitySlot[] = [];
	const dayStart = parseDayToUnixStartOfDayUTC(day);

	let currentStart = fromMinute;

	while (currentStart + durationMinutes <= toMinute) {
		const currentEnd = currentStart + durationMinutes;

		const isInOfferRange =
			availableMinutesFromOffers.has(currentStart) &&
			availableMinutesFromOffers.has(currentEnd - 1);

		const isFree =
			!dayState ||
			isRangeFree(dayState.booked, dayState.held, currentStart, currentEnd);

		if (isInOfferRange && isFree) {
			slots.push({
				start: dayStart + currentStart * 60 * 1000,
				end: dayStart + currentEnd * 60 * 1000,
			});
		}

		currentStart += 15;
	}

	return slots;
};
