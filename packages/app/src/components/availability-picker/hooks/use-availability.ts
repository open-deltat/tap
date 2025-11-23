import {
	AvailabilityClient,
	type AvailabilitySlot,
	AvailabilityStore,
	getDayRange,
	getMonthGridRange,
	type TimeRange,
} from '@tap/client';
import type { LedgerEvent } from '@tap/core';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type { AvailabilitySlot, TimeRange };

export type UseAvailabilityOptions = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
	selectedDate: Date | undefined;
	durationMs?: number;
	fromHour?: number;
	toHour?: number;
	timezone?: string;
};

export type UseAvailabilityResult = {
	slots: AvailabilitySlot[];
	isLoading: boolean;
	error: Error | null;
	refresh: () => Promise<void>;
	applyDelta: (event: LedgerEvent) => void;
	cursor: string | null;
	availableDays: Set<string>; // 'YYYY-MM-DD'
	refreshMonth: (date: Date) => Promise<void>;
};

export const useAvailability = (
	options: UseAvailabilityOptions,
): UseAvailabilityResult => {
	const {
		apiBaseUrl,
		tenantSlug,
		resourceSlug,
		selectedDate,
		durationMs = 60 * 60000,
		fromHour = 0,
		toHour = 24,
		timezone,
	} = options;

	const store = useMemo(() => new AvailabilityStore(), []);
	const client = useMemo(
		() => new AvailabilityClient(apiBaseUrl, tenantSlug, resourceSlug),
		[apiBaseUrl, tenantSlug, resourceSlug],
	);

	const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
	const [cursor, setCursor] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [availableDays, setAvailableDays] = useState<Set<string>>(new Set());

	// Fetch slots for the specific selected day
	const fetchAvailability = useCallback(
		async (date: Date) => {
			setIsLoading(true);
			setError(null);

			try {
				const range = getDayRange(date, timezone, fromHour, toHour);

				const result = await client.getAvailability({
					from: range.from,
					to: range.to,
					slotDurationMs: durationMs,
				});

				store.setSnapshot(result.freeSlots, result.asOfEventId);
				const snapshot = store.getSnapshot();
				setSlots(snapshot.slots as AvailabilitySlot[]); // Cast back since store works with TimeRange
				setCursor(snapshot.cursor);
			} catch (err) {
				setError(err instanceof Error ? err : new Error('Unknown error'));
			} finally {
				setIsLoading(false);
			}
		},
		[client, durationMs, fromHour, toHour, store, timezone],
	);

	// Fetch availability for the whole month to populate the calendar
	const refreshMonth = useCallback(
		async (date: Date) => {
			try {
				const range = getMonthGridRange(date);

				const result = await client.getAvailability({
					from: range.from,
					to: range.to,
					slotDurationMs: durationMs,
				});

				const days = client.extractAvailableDays(result.freeSlots, timezone);
				setAvailableDays(days);
			} catch (e) {
				console.error('Failed to fetch month availability', e);
			}
		},
		[client, durationMs, timezone],
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

	// Initial month fetch
	useEffect(() => {
		refreshMonth(selectedDate || new Date());
	}, [refreshMonth, selectedDate]);

	const applyDelta = useCallback(
		(event: LedgerEvent) => {
			store.applyEvent(event);
			const snapshot = store.getSnapshot();
			setSlots(snapshot.slots as AvailabilitySlot[]);
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
		availableDays,
		refreshMonth,
	};
};
