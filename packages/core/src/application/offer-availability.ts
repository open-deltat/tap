import type { DayKey, Minute } from '../domain/ids';
import type { Offer } from '../domain/schemas';

const DEFAULT_OFFER: Offer = {
	id: 'default',
	tenantId: 'default',
	resourceId: 'default',
	daysOfWeek: [1, 2, 3, 4, 5],
	startTime: '09:00',
	endTime: '17:00',
	currency: 'USD',
};

export const getAvailableMinutesFromOffers = (
	day: DayKey,
	offers: Offer[],
): Set<Minute> => {
	const dayDate = new Date(day);
	const dayOfWeek = dayDate.getDay();

	const availableMinutes = new Set<Minute>();
	const effectiveOffers = offers.length > 0 ? offers : [DEFAULT_OFFER];

	for (const offer of effectiveOffers) {
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
