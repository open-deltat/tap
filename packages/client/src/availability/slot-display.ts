import type { LedgerEvent } from '@open-tap/core';
import type { AvailabilitySlot } from '@open-tap/protocol';
import { format } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

export type DisplayedSlot = {
	start: number;
	end: number;
	available: boolean;
	isReleased?: boolean;
};

const DEFAULT_SLOT_DURATION_MS = 60 * 60000;

const getDayBoundsInTimezone = (
	date: Date,
	timezone: string,
): { start: number; end: number } | null => {
	try {
		const dateStr = format(date, 'yyyy-MM-dd');
		const nextDay = new Date(date);
		nextDay.setDate(nextDay.getDate() + 1);

		return {
			start: fromZonedTime(`${dateStr}T00:00:00`, timezone).getTime(),
			end: fromZonedTime(
				`${format(nextDay, 'yyyy-MM-dd')}T00:00:00`,
				timezone,
			).getTime(),
		};
	} catch {
		return null;
	}
};

const isSlotAvailable = (
	slotStart: number,
	slotEnd: number,
	availableSlots: AvailabilitySlot[],
): boolean =>
	availableSlots.some((s) => s.start <= slotStart && s.end >= slotEnd);

const wasSlotReleased = (
	slotStart: number,
	slotEnd: number,
	lastEvent?: LedgerEvent | null,
): boolean => {
	if (lastEvent?.type !== 'HoldReleased' || !lastEvent.payload.startUnix)
		return false;
	const { startUnix, endUnix = startUnix } = lastEvent.payload;
	return Math.max(slotStart, startUnix) < Math.min(slotEnd, endUnix);
};

export const generateDisplayedSlots = (
	selectedDate: Date,
	availableSlots: AvailabilitySlot[],
	timezone: string,
	durationMs = DEFAULT_SLOT_DURATION_MS,
	lastEvent?: LedgerEvent | null,
): DisplayedSlot[] => {
	if (!selectedDate) return [];

	const bounds = getDayBoundsInTimezone(selectedDate, timezone);
	if (!bounds) return [];

	const displayedSlots: DisplayedSlot[] = [];

	for (
		let current = bounds.start;
		current + durationMs <= bounds.end;
		current += durationMs
	) {
		displayedSlots.push({
			start: current,
			end: current + durationMs,
			available: isSlotAvailable(current, current + durationMs, availableSlots),
			isReleased: wasSlotReleased(current, current + durationMs, lastEvent),
		});
	}

	return displayedSlots;
};
