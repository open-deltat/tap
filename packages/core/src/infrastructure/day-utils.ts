import type { DayKey } from '../domain/ids';

export const parseDayToUnixStartOfDayUTC = (day: DayKey): number => {
	const parts = day.split('-');
	if (parts.length !== 3) {
		throw new Error(`Invalid day format: ${day}. Expected YYYY-MM-DD`);
	}

	const [year, month, date] = parts.map(Number);
	if (
		!year ||
		!month ||
		!date ||
		Number.isNaN(year) ||
		Number.isNaN(month) ||
		Number.isNaN(date)
	) {
		throw new Error(`Invalid day format: ${day}. Expected YYYY-MM-DD`);
	}

	if (month < 1 || month > 12) {
		throw new Error(`Invalid month: ${month}. Must be between 1 and 12`);
	}

	if (date < 1 || date > 31) {
		throw new Error(`Invalid date: ${date}. Must be between 1 and 31`);
	}

	const unix = Date.UTC(year, month - 1, date, 0, 0, 0, 0);
	const resultDate = new Date(unix);

	if (
		resultDate.getUTCFullYear() !== year ||
		resultDate.getUTCMonth() !== month - 1 ||
		resultDate.getUTCDate() !== date
	) {
		throw new Error(
			`Invalid date: ${day}. Date does not exist (e.g., Feb 30, Apr 31)`,
		);
	}

	return unix;
};

export const getDayOfWeekUTC = (day: DayKey): number => {
	const unixStartOfDay = parseDayToUnixStartOfDayUTC(day);
	const date = new Date(unixStartOfDay);
	return date.getUTCDay();
};

export const getUnixStartOfDayUTC = (unixTimestamp: number): number => {
	const date = new Date(unixTimestamp);
	return Date.UTC(
		date.getUTCFullYear(),
		date.getUTCMonth(),
		date.getUTCDate(),
		0,
		0,
		0,
		0,
	);
};
