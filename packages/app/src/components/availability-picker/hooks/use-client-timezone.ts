'use client';

import { useCallback, useState } from 'react';
import { getClientTimezone } from '@/lib/timezone';

export const useClientTimezone = (initialTimezone?: string) => {
	// Initialize with provided timezone or browser timezone
	const [timezone, setTimezone] = useState<string>(
		() => initialTimezone || getClientTimezone(),
	);

	// Helper to format dates in the current timezone using native Intl
	// This bypasses potential date-fns-tz version mismatch issues
	const format = useCallback(
		(date: Date | number, fmt: string) => {
			const d = new Date(date);

			if (fmt === 'h:mm a') {
				return new Intl.DateTimeFormat('en-US', {
					hour: 'numeric',
					minute: 'numeric',
					hour12: true,
					timeZone: timezone,
				}).format(d);
			}

			if (fmt === 'EEEE, MMMM d') {
				return new Intl.DateTimeFormat('en-US', {
					weekday: 'long',
					month: 'long',
					day: 'numeric',
					timeZone: timezone,
				}).format(d);
			}

			// Fallback for debug or other formats
			return d.toLocaleString('en-US', { timeZone: timezone });
		},
		[timezone],
	);

	return {
		timezone,
		setTimezone,
		format,
	};
};
