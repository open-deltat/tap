'use client';

import { TimezoneStore } from '@tap/client';
import { useCallback, useMemo, useState } from 'react';

export const useClientTimezone = (initialTimezone?: string) => {
	const store = useMemo(
		() => new TimezoneStore(initialTimezone),
		[initialTimezone],
	);
	const [timezone, setTimezoneState] = useState<string>(() =>
		store.getTimezone(),
	);

	const setTimezone = useCallback(
		(tz: string) => {
			store.setTimezone(tz);
			setTimezoneState(tz);
		},
		[store],
	);

	const formatTime = useCallback(
		(date: Date | number) => store.formatTime(date),
		[store],
	);
	const formatDate = useCallback(
		(date: Date | number) => store.formatDate(date),
		[store],
	);

	return { timezone, setTimezone, formatTime, formatDate };
};
