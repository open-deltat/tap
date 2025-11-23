'use client';

import type { LedgerEvent } from '@tap/core';
import type { AvailabilityPostResponse } from '@tap/protocol';
import { AvailabilityStore } from '@tap/ws-client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, formatTz, fromZonedTime } from '@/lib/timezone';

export type AvailabilitySlot = {
	start: number;
	end: number;
};

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
				// Construct fetch window based on selected timezone or fallback to local logic
				let fromDate: Date;
				let toDate: Date;

				if (timezone) {
					// If we have a timezone, we interpret 'date' (which is a local date object from Calendar)
					// as "The day YYYY-MM-DD in the target timezone".
					const dateStr = format(date, 'yyyy-MM-dd'); // '2025-11-24'

					// Use strictly ISO format for fromZonedTime: YYYY-MM-DDTHH:mm:ss
					const startStr = `${dateStr}T${fromHour.toString().padStart(2, '0')}:00:00`;

					fromDate = fromZonedTime(startStr, timezone);

					if (toHour === 24) {
						const nextDay = new Date(date);
						nextDay.setDate(nextDay.getDate() + 1);
						const nextDayStr = format(nextDay, 'yyyy-MM-dd');
						toDate = fromZonedTime(`${nextDayStr}T00:00:00`, timezone);
					} else {
						const endStr = `${dateStr}T${toHour.toString().padStart(2, '0')}:00:00`;
						toDate = fromZonedTime(endStr, timezone);
					}

					// console.log('Fetching range', { timezone, from: fromDate.toISOString(), to: toDate.toISOString() });
				} else {
					// Legacy local fallback
					fromDate = new Date(date);
					fromDate.setHours(fromHour, 0, 0, 0);
					toDate = new Date(date);
					toDate.setHours(toHour, 0, 0, 0);
				}

				const body = {
					tenantId: tenantSlug,
					resourceId: resourceSlug,
					from: fromDate.toISOString(),
					to: toDate.toISOString(),
					slotDurationMs: durationMs,
				};

				const response = await fetch(`${apiBaseUrl}/availability`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
				});

				if (!response.ok) {
					throw new Error(`Failed to fetch: ${response.status}`);
				}

				const data = (await response.json()) as AvailabilityPostResponse;

				// Convert protocol slots to store slots
				const initialSlots = data.freeSlots.map((s) => ({
					start: s.start,
					end: s.end,
				}));

				store.setSnapshot(initialSlots, data.asOfEventId);
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
			durationMs,
			fromHour,
			toHour,
			store,
			timezone,
		],
	);

	// Fetch availability for the whole month to populate the calendar
	const refreshMonth = useCallback(
		async (date: Date) => {
			// Fetch a slightly wider range to cover calendar grid (prev/next month days)
			const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
			const startOfGrid = new Date(startOfMonth);
			startOfGrid.setDate(startOfGrid.getDate() - 7); // -7 days buffer

			const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
			const endOfGrid = new Date(endOfMonth);
			endOfGrid.setDate(endOfGrid.getDate() + 7); // +7 days buffer
			endOfGrid.setHours(23, 59, 59, 999);

			try {
				const body = {
					tenantId: tenantSlug,
					resourceId: resourceSlug,
					from: startOfGrid.toISOString(),
					to: endOfGrid.toISOString(),
					slotDurationMs: durationMs,
				};

				const response = await fetch(`${apiBaseUrl}/availability`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
				});

				if (response.ok) {
					const data = (await response.json()) as AvailabilityPostResponse;
					const days = new Set<string>();
					for (const slot of data.freeSlots) {
						// Use timezone aware formatting to determine which "Day" this slot belongs to
						// If timezone is provided, we use it. Otherwise fallback to local.
						let dateKey: string;
						if (timezone) {
							// Important: date-fns-tz format(date, fmt, { timeZone }) uses the timestamp
							// and formats it as it appears in that timezone.
							// slot.start is UTC.
							dateKey = formatTz(new Date(slot.start), 'yyyy-MM-dd', {
								timeZone: timezone,
							});
						} else {
							dateKey = formatTz(new Date(slot.start), 'yyyy-MM-dd'); // Local fallback
						}

						if (dateKey) days.add(dateKey);
					}
					setAvailableDays(days);
				}
			} catch (e) {
				console.error('Failed to fetch month availability', e);
			}
		},
		[apiBaseUrl, tenantSlug, resourceSlug, durationMs, timezone],
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
		availableDays,
		refreshMonth,
	};
};
