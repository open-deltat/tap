'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
	type AvailabilitySlot,
	type AvailabilityState,
	createAvailabilityState,
	isSlotAvailable,
	updateAvailabilityFromEvent,
} from '@/lib/availability-state';
import {
	getDayKey,
	getMinutesFromMidnight,
	toISODateString,
} from '@/lib/timezone';
import type { BookingEvent } from '../../../stream-client/src/types';

export type UseAvailabilityOptions = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
	selectedDate: Date | undefined;
	slotResolutionMinutes?: number;
	durationMinutes?: number;
	fromHour?: number;
	toHour?: number;
};

export type UseAvailabilityResult = {
	slots: AvailabilitySlot[];
	isLoading: boolean;
	error: Error | null;
	refresh: () => Promise<void>;
	applyDelta: (event: BookingEvent) => void;
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
		slotResolutionMinutes = 15,
		durationMinutes = 60,
		fromHour = 0,
		toHour = 24,
	} = options;

	const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [cursor, setCursor] = useState<string | null>(null);
	const stateRef = useRef<AvailabilityState>(createAvailabilityState());

	const fetchAvailability = useCallback(
		async (date: Date) => {
			if (!date) return;

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
				};
				const fetchedSlots: AvailabilitySlot[] = data.slots.map((slot) => ({
					start: slot.start,
					end: slot.end,
				}));

				const dayKey = getDayKey(date);
				const fromMinute = fromHour * 60;
				const toMinute = toHour * 60;

				const state = stateRef.current;
				const dayState = state.get(dayKey);
				if (dayState) {
					const localSlots = getAvailableSlots(
						state,
						dayKey,
						fromMinute,
						toMinute,
						durationMinutes,
						slotResolutionMinutes,
					);

					const slotSet = new Set(
						fetchedSlots.map((s) => `${s.start}-${s.end}`),
					);
					const filteredLocalSlots = localSlots.filter(
						(s) => !slotSet.has(`${s.start}-${s.end}`),
					);

					setSlots([...fetchedSlots, ...filteredLocalSlots]);
				} else {
					setSlots(fetchedSlots);
				}

				try {
					const eventsResponse = await fetch(`${apiBaseUrl}/v1/events?limit=1`);
					if (eventsResponse.ok) {
						const eventsData = (await eventsResponse.json()) as {
							events: Array<{ eventId: string }>;
						};
						if (eventsData.events.length > 0 && eventsData.events[0]) {
							setCursor(eventsData.events[0].eventId);
						}
					}
				} catch {}
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
			slotResolutionMinutes,
		],
	);

	const refresh = useCallback(async () => {
		if (selectedDate) {
			await fetchAvailability(selectedDate);
		}
	}, [selectedDate, fetchAvailability]);

	const recalculateSlots = useCallback(
		(date: Date) => {
			const dayKey = getDayKey(date);
			const fromMinute = fromHour * 60;
			const toMinute = toHour * 60;

			const state = stateRef.current;
			const dayState = state.get(dayKey);

			if (dayState) {
				const localSlots = getAvailableSlots(
					state,
					dayKey,
					fromMinute,
					toMinute,
					durationMinutes,
					slotResolutionMinutes,
				);

				setSlots((currentSlots) => {
					const currentSlotSet = new Set(
						currentSlots.map((s) => `${s.start}-${s.end}`),
					);
					const filteredLocalSlots = localSlots.filter(
						(s) => !currentSlotSet.has(`${s.start}-${s.end}`),
					);

					const updatedSlots = currentSlots
						.filter((slot) => {
							const slotStart = new Date(slot.start);
							const slotDayKey = getDayKey(slotStart);
							if (slotDayKey !== dayKey) return true;

							const slotStartMinute = getMinutesFromMidnight(slotStart);
							const slotEndMinute = getMinutesFromMidnight(new Date(slot.end));
							const slotDuration = slotEndMinute - slotStartMinute;

							if (slotDuration !== durationMinutes) return true;

							return isSlotAvailable(
								state,
								dayKey,
								slotStartMinute,
								slotEndMinute,
							);
						})
						.concat(filteredLocalSlots);

					return updatedSlots;
				});
			}
		},
		[durationMinutes, fromHour, toHour, slotResolutionMinutes],
	);

	const applyDelta = useCallback(
		(event: BookingEvent) => {
			updateAvailabilityFromEvent(stateRef.current, event);

			if (selectedDate) {
				const dayKey = getDayKey(selectedDate);
				let shouldUpdate = false;

				if (event.type === 'HoldPlaced') {
					shouldUpdate = event.payload.day === dayKey;
				} else if (event.type === 'HoldExpired') {
					shouldUpdate = stateRef.current.has(dayKey);
				} else if (event.type === 'BookingConfirmed') {
					shouldUpdate = getDayKey(new Date(event.payload.start)) === dayKey;
				} else if (event.type === 'BookingCancelled') {
					shouldUpdate = stateRef.current.has(dayKey);
				}

				if (shouldUpdate) {
					recalculateSlots(selectedDate);
					refresh();
				}
			}
		},
		[selectedDate, recalculateSlots, refresh],
	);

	useEffect(() => {
		if (selectedDate) {
			fetchAvailability(selectedDate);
		}
	}, [selectedDate, fetchAvailability]);

	return {
		slots,
		isLoading,
		error,
		refresh,
		applyDelta,
		cursor,
	};
};

const getAvailableSlots = (
	state: AvailabilityState,
	dayKey: string,
	fromMinute: number,
	toMinute: number,
	durationMinutes: number,
	slotResolutionMinutes: number,
): AvailabilitySlot[] => {
	const dayState = state.get(dayKey);
	if (!dayState) {
		return [];
	}

	const slots: AvailabilitySlot[] = [];
	const dayStart = fromDayKey(dayKey).getTime();

	for (
		let startMinute = fromMinute;
		startMinute + durationMinutes <= toMinute;
		startMinute += slotResolutionMinutes
	) {
		const endMinute = startMinute + durationMinutes;
		let isAvailable = true;

		for (let m = startMinute; m < endMinute; m++) {
			if (dayState.booked.has(m) || dayState.held.has(m)) {
				isAvailable = false;
				break;
			}
		}

		if (isAvailable) {
			slots.push({
				start: dayStart + startMinute * 60 * 1000,
				end: dayStart + endMinute * 60 * 1000,
			});
		}
	}

	return slots;
};

const fromDayKey = (dayKey: string): Date => {
	const parts = dayKey.split('-').map(Number);
	const year = parts[0];
	const month = parts[1];
	const day = parts[2];
	if (year === undefined || month === undefined || day === undefined) {
		throw new Error(`Invalid dayKey format: ${dayKey}`);
	}
	return new Date(year, month - 1, day);
};
