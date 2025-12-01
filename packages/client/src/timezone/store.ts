export const getClientTimezone = (): string =>
	Intl.DateTimeFormat().resolvedOptions().timeZone;

const TIME_FORMAT: Intl.DateTimeFormatOptions = {
	hour: 'numeric',
	minute: 'numeric',
	hour12: true,
};

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
	weekday: 'long',
	month: 'long',
	day: 'numeric',
};

export class TimezoneStore {
	constructor(private timezone: string = getClientTimezone()) {}

	getTimezone = (): string => this.timezone;
	setTimezone = (timezone: string): void => {
		this.timezone = timezone;
	};

	formatTime = (date: Date | number): string =>
		new Intl.DateTimeFormat('en-US', {
			...TIME_FORMAT,
			timeZone: this.timezone,
		}).format(new Date(date));

	formatDate = (date: Date | number): string =>
		new Intl.DateTimeFormat('en-US', {
			...DATE_FORMAT,
			timeZone: this.timezone,
		}).format(new Date(date));
}
