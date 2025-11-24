export const getClientTimezone = (): string => {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

export class TimezoneStore {
	private timezone: string;

	constructor(initialTimezone?: string) {
		this.timezone = initialTimezone || getClientTimezone();
	}

	getTimezone(): string {
		return this.timezone;
	}

	setTimezone(timezone: string): void {
		this.timezone = timezone;
	}

	format(date: Date | number, format: string): string {
		const d = new Date(date);

		if (format === 'h:mm a') {
			return new Intl.DateTimeFormat('en-US', {
				hour: 'numeric',
				minute: 'numeric',
				hour12: true,
				timeZone: this.timezone,
			}).format(d);
		}

		if (format === 'EEEE, MMMM d') {
			return new Intl.DateTimeFormat('en-US', {
				weekday: 'long',
				month: 'long',
				day: 'numeric',
				timeZone: this.timezone,
			}).format(d);
		}

		return d.toLocaleString('en-US', { timeZone: this.timezone });
	}
}
