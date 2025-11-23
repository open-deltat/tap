import type { LedgerEvent } from '@tap/core';
import type { AvailabilitySlot } from '@tap/protocol';
import { format } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

export type TimeRange = Pick<AvailabilitySlot, 'start' | 'end'>;

/**
 * Calculates the ISO start/end strings for a specific date in a timezone.
 */
export function getDayRange(
	date: Date,
	timezone?: string,
	fromHour = 0,
	toHour = 24,
): { from: string; to: string } {
	if (timezone) {
		// If we have a timezone, we interpret 'date' (which is a local date object from Calendar)
		// as "The day YYYY-MM-DD in the target timezone".
		const dateStr = format(date, 'yyyy-MM-dd');

		// Use strictly ISO format for fromZonedTime: YYYY-MM-DDTHH:mm:ss
		const startStr = `${dateStr}T${fromHour.toString().padStart(2, '0')}:00:00`;
		const fromDate = fromZonedTime(startStr, timezone);
		let toDate: Date;

		if (toHour === 24) {
			const nextDay = new Date(date);
			nextDay.setDate(nextDay.getDate() + 1);
			const nextDayStr = format(nextDay, 'yyyy-MM-dd');
			toDate = fromZonedTime(`${nextDayStr}T00:00:00`, timezone);
		} else {
			const endStr = `${dateStr}T${toHour.toString().padStart(2, '0')}:00:00`;
			toDate = fromZonedTime(endStr, timezone);
		}
		return {
			from: fromDate.toISOString(),
			to: toDate.toISOString(),
		};
	}

	// Legacy local fallback
	const fromDate = new Date(date);
	fromDate.setHours(fromHour, 0, 0, 0);
	const toDate = new Date(date);
	toDate.setHours(toHour, 0, 0, 0);

	return {
		from: fromDate.toISOString(),
		to: toDate.toISOString(),
	};
}

/**
 * Calculates the ISO start/end strings for a month grid (including padding).
 */
export function getMonthGridRange(date: Date): { from: string; to: string } {
	// Fetch a slightly wider range to cover calendar grid (prev/next month days)
	const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
	const startOfGrid = new Date(startOfMonth);
	startOfGrid.setDate(startOfGrid.getDate() - 7); // -7 days buffer

	const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
	const endOfGrid = new Date(endOfMonth);
	endOfGrid.setDate(endOfGrid.getDate() + 7); // +7 days buffer
	endOfGrid.setHours(23, 59, 59, 999);

	return {
		from: startOfGrid.toISOString(),
		to: endOfGrid.toISOString(),
	};
}

export function applyEventToSlots(
	slots: TimeRange[],
	event: LedgerEvent,
): TimeRange[] {
	const range = getEventTimeRange(event);
	if (!range) {
		return slots;
	}

	if (isBlocking(event)) {
		return subtractRange(slots, range.start, range.end);
	}

	if (isReleasing(event)) {
		return addRange(slots, range.start, range.end);
	}

	return slots;
}

function getEventTimeRange(event: LedgerEvent): TimeRange | null {
	if (
		event.type === 'HoldPlaced' ||
		event.type === 'HoldExpired' ||
		event.type === 'HoldReleased'
	) {
		if (
			event.payload.startUnix === undefined ||
			event.payload.endUnix === undefined
		) {
			return null;
		}
		return {
			start: event.payload.startUnix,
			end: event.payload.endUnix,
		};
	}
	if (event.type === 'BookingConfirmed' || event.type === 'BookingCancelled') {
		if (event.payload.start === undefined || event.payload.end === undefined) {
			return null;
		}
		return {
			start: event.payload.start,
			end: event.payload.end,
		};
	}
	return null;
}

function isBlocking(event: LedgerEvent) {
	return event.type === 'HoldPlaced' || event.type === 'BookingConfirmed';
}

function isReleasing(event: LedgerEvent) {
	return (
		event.type === 'HoldExpired' ||
		event.type === 'HoldReleased' ||
		event.type === 'BookingCancelled'
	);
}

function subtractRange(
	slots: TimeRange[],
	start: number,
	end: number,
): TimeRange[] {
	const result: TimeRange[] = [];
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
}

function addRange(slots: TimeRange[], start: number, end: number): TimeRange[] {
	// Add range and merge overlapping/adjacent slots
	const newSlots = [...slots, { start, end }];
	newSlots.sort((a, b) => a.start - b.start);

	const result: TimeRange[] = [];
	if (newSlots.length === 0) return result;

	const first = newSlots[0];
	if (!first) return result;

	let current = { ...first }; // Copy to avoid mutation issues
	for (let i = 1; i < newSlots.length; i++) {
		const next = newSlots[i];
		if (!next) continue;

		// If next starts within or immediately after current (mergable)
		if (next.start <= current.end) {
			// Merge
			current.end = Math.max(current.end, next.end);
		} else {
			// Gap found, push current and start new
			result.push(current);
			current = { ...next };
		}
	}
	result.push(current);
	return result;
}
