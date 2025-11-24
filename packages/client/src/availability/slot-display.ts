import type { LedgerEvent } from '@tap/core';
import type { AvailabilitySlot } from '@tap/protocol';
import { format } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

export type DisplayedSlot = {
	start: number;
	end: number;
	available: boolean;
	isReleased?: boolean;
};

export type GenerateDisplayedSlotsOptions = {
	selectedDate: Date;
	slots: AvailabilitySlot[];
	durationMs: number;
	timezone: string;
	lastEvent?: LedgerEvent | null;
};

export function generateDisplayedSlots(
	options: GenerateDisplayedSlotsOptions,
): DisplayedSlot[] {
	const { selectedDate, slots, durationMs, timezone, lastEvent } = options;

	if (!selectedDate) return [];

	const list: DisplayedSlot[] = [];
	const resolutionMs = durationMs || 60 * 60000;

	const dateStr = format(selectedDate, 'yyyy-MM-dd');
	const startStr = `${dateStr}T00:00:00`;

	let startTime: number;
	let endTime: number;

	try {
		startTime = fromZonedTime(startStr, timezone).getTime();

		const nextDay = new Date(selectedDate);
		nextDay.setDate(nextDay.getDate() + 1);
		const nextDayStr = format(nextDay, 'yyyy-MM-dd');
		endTime = fromZonedTime(`${nextDayStr}T00:00:00`, timezone).getTime();
	} catch (e) {
		console.error('Timezone conversion error', e);
		return [];
	}

	let current = startTime;
	const end = endTime;

	while (current + resolutionMs <= end) {
		const slotStart = current;
		const slotEnd = current + resolutionMs;

		const isAvailable = slots.some(
			(s) => s.start <= slotStart && s.end >= slotEnd,
		);

		let isReleased = false;
		if (lastEvent?.type === 'HoldReleased' && lastEvent.payload.startUnix) {
			const evStart = lastEvent.payload.startUnix;
			const evEnd = lastEvent.payload.endUnix || evStart;

			if (Math.max(slotStart, evStart) < Math.min(slotEnd, evEnd)) {
				isReleased = true;
			}
		}

		list.push({
			start: slotStart,
			end: slotEnd,
			available: isAvailable,
			isReleased,
		});

		current += resolutionMs;
	}

	return list;
}
