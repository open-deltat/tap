import { format as formatTz, fromZonedTime, toZonedTime } from 'date-fns-tz';

export const getClientTimezone = (): string => {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

export const toUnixTimestamp = (date: Date): number => {
	return Math.floor(date.getTime());
};

export const fromUnixTimestamp = (timestamp: number): Date => {
	return new Date(timestamp);
};

export const toISODateString = (date: Date): string => {
	return date.toISOString();
};

export const fromISODateString = (isoString: string): Date => {
	return new Date(isoString);
};

export const getDayKey = (date: Date, timezone?: string): string => {
	if (timezone) {
		return formatTz(date, 'yyyy-MM-dd', { timeZone: timezone });
	}
	return format(date, 'yyyy-MM-dd');
};

export const fromDayKey = (dayKey: string): Date => {
	const parts = dayKey.split('-').map(Number);
	const year = parts[0];
	const month = parts[1];
	const day = parts[2];
	if (year === undefined || month === undefined || day === undefined) {
		throw new Error(`Invalid dayKey format: ${dayKey}`);
	}
	return new Date(year, month - 1, day);
};

export const getMinutesFromMidnight = (date: Date): number => {
	return date.getHours() * 60 + date.getMinutes();
};

export const setMinutesFromMidnight = (date: Date, minutes: number): Date => {
	const newDate = new Date(date);
	newDate.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
	return newDate;
};

export { format } from 'date-fns';
export { format as formatTz, fromZonedTime, toZonedTime } from 'date-fns-tz';
