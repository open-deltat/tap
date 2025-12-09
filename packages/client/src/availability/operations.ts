import type { LedgerEvent } from '@open-tap/core';
import type { AvailabilitySlot } from '@open-tap/protocol';
import { format } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

export type TimeRange = Pick<AvailabilitySlot, 'start' | 'end'>;

const CALENDAR_BUFFER_DAYS = 7;

export const getDayRange = (
	date: Date,
	timezone?: string,
	fromHour = 0,
	toHour = 24,
): { from: string; to: string } => {
	if (timezone) {
		const dateStr = format(date, 'yyyy-MM-dd');
		const startStr = `${dateStr}T${fromHour.toString().padStart(2, '0')}:00:00`;
		const fromDate = fromZonedTime(startStr, timezone);

		let toDate: Date;
		if (toHour === 24) {
			const nextDay = new Date(date);
			nextDay.setDate(nextDay.getDate() + 1);
			toDate = fromZonedTime(
				`${format(nextDay, 'yyyy-MM-dd')}T00:00:00`,
				timezone,
			);
		} else {
			toDate = fromZonedTime(
				`${dateStr}T${toHour.toString().padStart(2, '0')}:00:00`,
				timezone,
			);
		}

		return { from: fromDate.toISOString(), to: toDate.toISOString() };
	}

	const fromDate = new Date(date);
	fromDate.setHours(fromHour, 0, 0, 0);
	const toDate = new Date(date);
	toDate.setHours(toHour, 0, 0, 0);

	return { from: fromDate.toISOString(), to: toDate.toISOString() };
};

export const getMonthGridRange = (date: Date): { from: string; to: string } => {
	const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
	const startOfGrid = new Date(startOfMonth);
	startOfGrid.setDate(startOfGrid.getDate() - CALENDAR_BUFFER_DAYS);

	const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
	const endOfGrid = new Date(endOfMonth);
	endOfGrid.setDate(endOfGrid.getDate() + CALENDAR_BUFFER_DAYS);
	endOfGrid.setHours(23, 59, 59, 999);

	return { from: startOfGrid.toISOString(), to: endOfGrid.toISOString() };
};

const getEventTimeRange = (event: LedgerEvent): TimeRange | null => {
	if (
		event.type === 'HoldPlaced' ||
		event.type === 'HoldExpired' ||
		event.type === 'HoldReleased'
	) {
		if (
			event.payload.startUnix === undefined ||
			event.payload.endUnix === undefined
		)
			return null;
		return { start: event.payload.startUnix, end: event.payload.endUnix };
	}
	if (event.type === 'BookingConfirmed' || event.type === 'BookingCancelled') {
		if (event.payload.start === undefined || event.payload.end === undefined)
			return null;
		return { start: event.payload.start, end: event.payload.end };
	}
	return null;
};

const isBlockingEvent = (event: LedgerEvent): boolean =>
	event.type === 'HoldPlaced' || event.type === 'BookingConfirmed';

const isReleasingEvent = (event: LedgerEvent): boolean =>
	event.type === 'HoldExpired' ||
	event.type === 'HoldReleased' ||
	event.type === 'BookingCancelled';

const subtractRangeFromSlots = (
	slots: TimeRange[],
	start: number,
	end: number,
): TimeRange[] => {
	const result: TimeRange[] = [];
	for (const slot of slots) {
		if (slot.end <= start || slot.start >= end) {
			result.push(slot);
			continue;
		}
		if (slot.start < start) result.push({ start: slot.start, end: start });
		if (slot.end > end) result.push({ start: end, end: slot.end });
	}
	return result;
};

const addRangeToSlots = (
	slots: TimeRange[],
	start: number,
	end: number,
): TimeRange[] => {
	const newSlots = [...slots, { start, end }].sort((a, b) => a.start - b.start);
	if (newSlots.length === 0) return [];

	const first = newSlots[0];
	if (!first) return [];

	const result: TimeRange[] = [];
	let current = { ...first };

	for (let i = 1; i < newSlots.length; i++) {
		const next = newSlots[i];
		if (!next) continue;

		if (next.start <= current.end) {
			current.end = Math.max(current.end, next.end);
		} else {
			result.push(current);
			current = { ...next };
		}
	}
	result.push(current);
	return result;
};

export const applyEventToSlots = (
	slots: TimeRange[],
	event: LedgerEvent,
): TimeRange[] => {
	const range = getEventTimeRange(event);
	if (!range) return slots;

	if (isBlockingEvent(event))
		return subtractRangeFromSlots(slots, range.start, range.end);
	if (isReleasingEvent(event))
		return addRangeToSlots(slots, range.start, range.end);

	return slots;
};
