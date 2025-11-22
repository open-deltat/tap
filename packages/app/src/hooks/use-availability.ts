'use client';

import type { LedgerEvent } from '@tap/core';
import type { AvailabilityPostResponse } from '@tap/protocol';
import { AvailabilityStore } from '@tap/ws-client';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
	debugLogs: string[];
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
	} = options;

	const store = useMemo(() => new AvailabilityStore(), []);
	const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
	const [cursor, setCursor] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [availableDays, setAvailableDays] = useState<Set<string>>(new Set());
	const [debugLogs, setDebugLogs] = useState<string[]>([]);

	// Fetch slots for the specific selected day
	const fetchAvailability = useCallback(
		async (date: Date) => {
			setIsLoading(true);
			setError(null);

			try {
				const fromDate = new Date(date);
				fromDate.setHours(fromHour, 0, 0, 0);
				const toDate = new Date(date);
				toDate.setHours(toHour, 0, 0, 0);

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
					start: new Date(s.start).getTime(),
					end: new Date(s.end).getTime(),
				}));

				store.setSnapshot(initialSlots, data.asOfEventId);
				const snapshot = store.getSnapshot();
				setSlots(snapshot.slots);
				setCursor(snapshot.cursor);
				setDebugLogs(store.getLogs());
			} catch (err) {
				setError(err instanceof Error ? err : new Error('Unknown error'));
			} finally {
				setIsLoading(false);
			}
		},
		[apiBaseUrl, tenantSlug, resourceSlug, durationMs, fromHour, toHour, store],
	);

	// Fetch availability for the whole month to populate the calendar
	const refreshMonth = useCallback(
		async (date: Date) => {
			const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
			const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
			endOfMonth.setHours(23, 59, 59, 999);

			try {
				const body = {
					tenantId: tenantSlug,
					resourceId: resourceSlug,
					from: startOfMonth.toISOString(),
					to: endOfMonth.toISOString(),
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
						const dateKey = slot.start.split('T')[0];
						if (dateKey) days.add(dateKey);
					}
					setAvailableDays(days);
				}
			} catch (e) {
				console.error('Failed to fetch month availability', e);
			}
		},
		[apiBaseUrl, tenantSlug, resourceSlug, durationMs],
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
			setDebugLogs(store.getLogs());
			// Ideally we should update availableDays here too if a day becomes fully booked or free
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
		debugLogs,
	};
};
