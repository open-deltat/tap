import type { DayKey, Minute } from '../domain/ids';
import type { Offer } from '../domain/schemas';

export const getAvailableMinutesFromOffers = (
	day: DayKey,
	offers: Offer[],
): Set<Minute> => {
	const dayDate = new Date(day);
	const dayOfWeek = dayDate.getDay();

	const availableMinutes = new Set<Minute>();

	for (const offer of offers) {
		if (!offer.daysOfWeek.includes(dayOfWeek)) {
			continue;
		}

		const [startHour, startMin] = offer.startTime.split(':').map(Number);
		const [endHour, endMin] = offer.endTime.split(':').map(Number);

		const startMinute = (startHour ?? 0) * 60 + (startMin ?? 0);
		const endMinute = (endHour ?? 0) * 60 + (endMin ?? 0);

		for (let m = startMinute; m < endMinute; m++) {
			availableMinutes.add(m as Minute);
		}
	}

	return availableMinutes;
};
