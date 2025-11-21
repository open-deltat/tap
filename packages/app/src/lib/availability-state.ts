import type { BookingEvent } from '@tap/ws-client';
import { getDayKey, getMinutesFromMidnight } from './timezone';

export type AvailabilitySlot = {
	start: number;
	end: number;
};

export type DayAvailabilityState = {
	booked: Set<number>;
	held: Set<number>;
	holdMetadata: Map<string, { startMinute: number; endMinute: number }>;
};

export type AvailabilityState = Map<string, DayAvailabilityState>;

export const createAvailabilityState = (): AvailabilityState => {
	return new Map();
};

export const applyBookingEvent = (
	state: AvailabilityState,
	event: BookingEvent,
): void => {
	if (event.type === 'HoldPlaced') {
		const dayKey = event.payload.day;
		const dayState = state.get(dayKey) || {
			booked: new Set(),
			held: new Set(),
			holdMetadata: new Map(),
		};
		const startMinute = event.payload.startMinute;
		const endMinute = event.payload.endMinute;
		const holdId = event.payload.holdId;

		for (let m = startMinute; m < endMinute; m++) {
			dayState.held.add(m);
		}
		dayState.holdMetadata.set(holdId, { startMinute, endMinute });
		state.set(dayKey, dayState);
	} else if (event.type === 'HoldExpired') {
		const holdId = event.payload.holdId;
		for (const [key, day] of state.entries()) {
			const holdInfo = day.holdMetadata.get(holdId);
			if (holdInfo) {
				for (let m = holdInfo.startMinute; m < holdInfo.endMinute; m++) {
					day.held.delete(m);
				}
				day.holdMetadata.delete(holdId);
				if (day.held.size === 0 && day.booked.size === 0) {
					state.delete(key);
				}
			}
		}
	} else if (event.type === 'BookingConfirmed') {
		const startDate = new Date(event.payload.start);
		const endDate = new Date(event.payload.end);
		const eventDayKey = getDayKey(startDate);
		const eventDayState = state.get(eventDayKey) || {
			booked: new Set(),
			held: new Set(),
			holdMetadata: new Map(),
		};

		const startMinute = getMinutesFromMidnight(startDate);
		const endMinute = getMinutesFromMidnight(endDate);

		const holdId = event.payload.holdId;
		for (let m = startMinute; m < endMinute; m++) {
			eventDayState.held.delete(m);
			eventDayState.booked.add(m);
		}
		if (holdId) {
			eventDayState.holdMetadata.delete(holdId);
		}

		state.set(eventDayKey, eventDayState);
	} else if (event.type === 'BookingCancelled') {
		for (const [key, day] of state.entries()) {
			if (day.booked.size > 0 || day.held.size > 0) {
				const bookedToRemove: number[] = [];
				for (const bookedMinute of day.booked) {
					bookedToRemove.push(bookedMinute);
				}
				for (const minute of bookedToRemove) {
					day.booked.delete(minute);
				}
				if (day.booked.size === 0 && day.held.size === 0) {
					state.delete(key);
				}
			}
		}
	}
};

export const isSlotAvailable = (
	state: AvailabilityState,
	dayKey: string,
	startMinute: number,
	endMinute: number,
): boolean => {
	const dayState = state.get(dayKey);
	if (!dayState) {
		return true;
	}

	for (let m = startMinute; m < endMinute; m++) {
		if (dayState.booked.has(m) || dayState.held.has(m)) {
			return false;
		}
	}

	return true;
};

export const getAvailableSlots = (
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

export const updateAvailabilityFromEvent = (
	state: AvailabilityState,
	event: BookingEvent,
): void => {
	applyBookingEvent(state, event);
};
