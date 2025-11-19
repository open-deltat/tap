import { parseDayToUnixStartOfDayUTC } from '@tap/core';
import type { LedgerEvent } from '@tap/core';

export type TimeSlot = { start: number; end: number };

export const mergeAvailability = (
	initialSlots: TimeSlot[],
	events: LedgerEvent[],
	asOfEventId: string | null,
): TimeSlot[] => {
	// Filter events newer than snapshot
	const newEvents = events.filter(
		(e) => !asOfEventId || e.eventId > asOfEventId,
	);
	// Sort chronologically
	newEvents.sort((a, b) => a.eventId.localeCompare(b.eventId));

	let currentSlots = [...initialSlots];

	for (const event of newEvents) {
		const range = getEventTimeRange(event);
		if (!range) continue;

		if (isBlocking(event)) {
			currentSlots = subtractRange(currentSlots, range.start, range.end);
		} else if (isReleasing(event)) {
			currentSlots = addRange(currentSlots, range.start, range.end);
		}
	}

	return currentSlots;
};

const getEventTimeRange = (event: LedgerEvent): TimeSlot | null => {
	if (
		event.type === 'HoldPlaced' ||
		event.type === 'HoldExpired' ||
		event.type === 'HoldReleased'
	) {
		const dayStart = parseDayToUnixStartOfDayUTC(event.payload.day);
		return {
			start: dayStart + event.payload.startMinute * 60000,
			end: dayStart + event.payload.endMinute * 60000,
		};
	}
	if (event.type === 'BookingConfirmed' || event.type === 'BookingCancelled') {
		return {
			start: event.payload.start,
			end: event.payload.end,
		};
	}
	return null;
};

const isBlocking = (event: LedgerEvent) =>
	event.type === 'HoldPlaced' || event.type === 'BookingConfirmed';
const isReleasing = (event: LedgerEvent) =>
	event.type === 'HoldExpired' ||
	event.type === 'HoldReleased' ||
	event.type === 'BookingCancelled';

const subtractRange = (
	slots: TimeSlot[],
	start: number,
	end: number,
): TimeSlot[] => {
	const result: TimeSlot[] = [];
	for (const slot of slots) {
		// Case 1: No overlap
		if (slot.end <= start || slot.start >= end) {
			result.push(slot);
			continue;
		}
		// Case 2: Overlap
		// Left part?
		if (slot.start < start) {
			result.push({ start: slot.start, end: start });
		}
		// Right part?
		if (slot.end > end) {
			result.push({ start: end, end: slot.end });
		}
	}
	return result;
};

const addRange = (
	slots: TimeSlot[],
	start: number,
	end: number,
): TimeSlot[] => {
	// Add range and merge overlapping/adjacent slots
	const newSlots = [...slots, { start, end }];
	newSlots.sort((a, b) => a.start - b.start);

	const result: TimeSlot[] = [];
	if (newSlots.length === 0) return result;

	let current = newSlots[0];
	for (let i = 1; i < newSlots.length; i++) {
		const next = newSlots[i];
		if (next.start <= current.end) {
			// Merge
			current.end = Math.max(current.end, next.end);
		} else {
			result.push(current);
			current = next;
		}
	}
	result.push(current);
	return result;
};

