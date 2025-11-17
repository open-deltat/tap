import type { DayKey } from '../domain/ids';

export const isWithinHorizon = (
	day: DayKey,
	horizonDays: number,
	now: number = Date.now(),
): boolean => {
	const dayDate = new Date(day);
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	dayDate.setHours(0, 0, 0, 0);

	const diffTime = dayDate.getTime() - today.getTime();
	const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

	return diffDays >= 0 && diffDays <= horizonDays;
};
