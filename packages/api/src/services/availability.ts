import type { AllocatorState, DayKey, Minute } from '@tap/core';
import { isRangeFree } from '@tap/core';
import type { AvailabilitySlot } from '../types';

export const getAvailability = (params: {
	state: AllocatorState;
	day: DayKey;
	fromMinute?: Minute;
	toMinute?: Minute;
	durationMinutes?: number;
}): AvailabilitySlot[] => {
	const {
		state,
		day,
		fromMinute = 0,
		toMinute = 1440,
		durationMinutes = 60,
	} = params;

	const dayState = state.get(day);
	if (!dayState) {
		return [];
	}

	const slots: AvailabilitySlot[] = [];
	const dayStart = new Date(day).setHours(0, 0, 0, 0);

	let currentStart = fromMinute;

	while (currentStart + durationMinutes <= toMinute) {
		const currentEnd = currentStart + durationMinutes;

		if (isRangeFree(dayState.booked, dayState.held, currentStart, currentEnd)) {
			slots.push({
				start: dayStart + currentStart * 60 * 1000,
				end: dayStart + currentEnd * 60 * 1000,
			});
		}

		currentStart += 15;
	}

	return slots;
};
