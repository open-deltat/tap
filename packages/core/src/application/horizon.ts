import type { DayKey } from '@tap/protocol';
import {
	getUnixStartOfDayUTC,
	parseDayToUnixStartOfDayUTC,
} from '../infrastructure/day-utils';

export const isWithinHorizon = (
	day: DayKey,
	horizonDays: number,
	now: number = Date.now(),
): boolean => {
	const dayStartUnix = parseDayToUnixStartOfDayUTC(day);
	const todayStartUnix = getUnixStartOfDayUTC(now);

	const diffTime = dayStartUnix - todayStartUnix;
	const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

	return diffDays >= 0 && diffDays <= horizonDays;
};
