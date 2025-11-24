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
		(newTimezone: string) => {
			store.setTimezone(newTimezone);
			setTimezoneState(newTimezone);
		},
		[store],
	);

	const format = useCallback(
		(date: Date | number, fmt: string) => {
			return store.format(date, fmt);
		},
		[store],
	);

	return {
		timezone,
		setTimezone,
		format,
	};
};
