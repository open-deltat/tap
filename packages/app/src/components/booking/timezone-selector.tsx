'use client';

import { Globe } from 'lucide-react';

// Common timezones for the dropdown
const COMMON_TIMEZONES = [
	'UTC',
	'America/New_York',
	'America/Los_Angeles',
	'America/Chicago',
	'America/Denver',
	'Europe/London',
	'Europe/Berlin',
	'Europe/Paris',
	'Asia/Tokyo',
	'Asia/Shanghai',
	'Asia/Singapore',
	'Asia/Dubai',
	'Australia/Sydney',
	'Pacific/Auckland',
];

export type TimezoneSelectorProps = {
	timezone: string;
	onTimezoneChange: (timezone: string) => void;
};

export const TimezoneSelector = ({
	timezone,
	onTimezoneChange,
}: TimezoneSelectorProps) => {
	return (
		<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
			<Globe className="h-3 w-3" />
			<select
				value={timezone}
				onChange={(e) => onTimezoneChange(e.target.value)}
				className="bg-transparent border-none outline-none cursor-pointer hover:text-foreground transition-colors"
			>
				<option value={timezone}>{timezone}</option>
				{COMMON_TIMEZONES.filter((tz) => tz !== timezone).map((tz) => (
					<option key={tz} value={tz}>
						{tz}
					</option>
				))}
			</select>
		</div>
	);
};
