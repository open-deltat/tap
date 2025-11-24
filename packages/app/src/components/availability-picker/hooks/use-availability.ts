import {
	AvailabilityManager,
	type AvailabilitySlot,
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
	availableDays: Set<string>;
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

	const manager = useMemo(
		() =>
			new AvailabilityManager({
				apiBaseUrl,
				tenantSlug,
				resourceSlug,
				durationMs,
				fromHour,
				toHour,
				timezone,
			}),
		[
			apiBaseUrl,
			tenantSlug,
			resourceSlug,
			durationMs,
			fromHour,
			toHour,
			timezone,
		],
	);

	const [state, setState] = useState(() => manager.getState());

	useEffect(() => {
		manager.setCallbacks({
			onStateChange: (newState) => {
				setState(newState);
			},
		});
	}, [manager]);

	useEffect(() => {
		if (selectedDate) {
			manager.fetchAvailability(selectedDate);
		}
	}, [manager, selectedDate]);

	useEffect(() => {
		manager.refreshMonth(selectedDate || new Date());
	}, [manager, selectedDate]);

	const refresh = useCallback(async () => {
		await manager.refresh(selectedDate);
	}, [manager, selectedDate]);

	const applyDelta = useCallback(
		(event: LedgerEvent) => {
			manager.applyDelta(event);
		},
		[manager],
	);

	const refreshMonth = useCallback(
		async (date: Date) => {
			await manager.refreshMonth(date);
		},
		[manager],
	);

	return {
		slots: state.slots,
		isLoading: state.isLoading,
		error: state.error,
		cursor: state.cursor,
		availableDays: state.availableDays,
		refresh,
		applyDelta,
		refreshMonth,
	};
};
