'use client';

import type { LedgerEvent } from '@tap/core';
import { AvailabilityStore } from '@tap/ws-client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toISODateString } from '@/lib/timezone';

export type AvailabilitySlot = {
	start: number;
	end: number;
};

export type UseAvailabilityOptions = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
	selectedDate: Date | undefined;
	durationMinutes?: number;
	slotResolutionMinutes?: number;
	fromHour?: number;
	toHour?: number;
};

export type UseAvailabilityResult = {
	slots: AvailabilitySlot[];
	isLoading: boolean;
	error: Error | null;
	refresh: () => Promise<void>;
	applyDelta: (event: LedgerEvent) => void;
	cursor: string | null;
};

export const useAvailability = (
	options: UseAvailabilityOptions,
): UseAvailabilityResult => {
	const {
		apiBaseUrl,
		tenantSlug,
		resourceSlug,
		selectedDate,
		durationMinutes = 60,
		fromHour = 0,
		toHour = 24,
	} = options;

	// Use the store to manage state
	const store = useMemo(() => new AvailabilityStore(), []);
	const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
	const [cursor, setCursor] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const fetchAvailability = useCallback(
		async (date: Date) => {
			setIsLoading(true);
			setError(null);

			try {
				const fromDate = new Date(date);
				fromDate.setHours(fromHour, 0, 0, 0);
				const toDate = new Date(date);
				toDate.setHours(toHour, 0, 0, 0);

				const fromISO = toISODateString(fromDate);
				const toISO = toISODateString(toDate);

				const url = `${apiBaseUrl}/v1/public/${tenantSlug}/${resourceSlug}/availability?from=${fromISO}&to=${toISO}&durationMinutes=${durationMinutes}`;

				const response = await fetch(url, {
					method: 'GET',
					headers: {
						'Content-Type': 'application/json',
					},
				});

				if (!response.ok) {
					let errorMessage = `Failed to fetch availability: ${response.status} ${response.statusText}`;
					try {
						const errorData = await response.json();
						errorMessage = errorData.error || errorMessage;
					} catch {}
					throw new Error(errorMessage);
				}

				const data = (await response.json()) as {
					slots: Array<{ start: number; end: number }>;
					asOfEventId: string;
				};

				store.setSnapshot(data.slots, data.asOfEventId);
				const snapshot = store.getSnapshot();
				setSlots(snapshot.slots);
				setCursor(snapshot.cursor);
			} catch (err) {
				setError(err instanceof Error ? err : new Error('Unknown error'));
			} finally {
				setIsLoading(false);
			}
		},
		[
			apiBaseUrl,
			tenantSlug,
			resourceSlug,
			durationMinutes,
			fromHour,
			toHour,
			store,
		],
	);

	const refresh = useCallback(async () => {
		if (selectedDate) {
			await fetchAvailability(selectedDate);
		}
	}, [selectedDate, fetchAvailability]);

	useEffect(() => {
		if (selectedDate) {
			fetchAvailability(selectedDate);
		}
	}, [selectedDate, fetchAvailability]);

	const applyDelta = useCallback(
		(event: LedgerEvent) => {
			console.log('[useAvailability] Applying Delta:', event);
			store.applyEvent(event);
			const snapshot = store.getSnapshot();
			setSlots(snapshot.slots);
			setCursor(snapshot.cursor);
		},
		[store],
	);

	return {
		slots,
		isLoading,
		error,
		refresh,
		applyDelta,
		cursor,
	};
};
