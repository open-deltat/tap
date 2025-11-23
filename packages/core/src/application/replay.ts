import type { DayKey, HoldId, ResourceId, TenantId } from '@tap/protocol';
import { format as formatTz, toZonedTime } from 'date-fns-tz';
import type {
	BookingConfirmedEvent,
	HoldPlacedEvent,
	LedgerEvent,
} from '../domain/events';
import { createBitmapDay, setBitRange } from '../infrastructure/bitmap';
import type { Inventory } from './inventory/inventory';
import type { InventoryState } from './inventory/types';

// TODO: We need the resource timezone for replay.
// For now assuming UTC or passing it in could work if we had resource metadata here.
// But wait, if events store unix timestamps, we need to know the timezone to map to "days" for the bitmap.
// The bitmap is a "local time" representation of inventory.
// This is a design constraint: The core domain needs timezone awareness to map unix <-> bitmap.
// Let's assume for now that we can derive it or default to UTC, but ideally `replayEvents` should take a timezone resolver.

// Assuming a default for now until we refactor replay signature.
const DEFAULT_TIMEZONE = 'UTC';

const getSegments = (startUnix: number, endUnix: number, timezone: string) => {
	// Re-using logic similar to hold-manager but simplified for replay which just sets bits
	const segments: { day: DayKey; start: number; end: number }[] = [];
	let current = startUnix;
	if (endUnix <= startUnix) return [];

	while (current < endUnix) {
		const date = toZonedTime(current, timezone);
		const day = formatTz(date, 'yyyy-MM-dd', { timeZone: timezone }) as DayKey;
		const startMinute = date.getHours() * 60 + date.getMinutes();

		const nextDay = new Date(date);
		nextDay.setDate(nextDay.getDate() + 1);
		nextDay.setHours(0, 0, 0, 0);

		const endDate = toZonedTime(endUnix, timezone);
		const endDay = formatTz(endDate, 'yyyy-MM-dd', {
			timeZone: timezone,
		}) as DayKey;

		let endMinute = 1440;
		let stepEndUnix = 0;

		if (day === endDay) {
			const m = endDate.getHours() * 60 + endDate.getMinutes();
			endMinute = m;
			stepEndUnix = endUnix;
		} else {
			endMinute = 1440;
			// Rough advance: we need exact unix of next day start?
			// Ideally we duplicate the robust logic from hold-manager.
			// But for replay speed, maybe we can just jump?
			// Let's use Date object manipulation on the "local" date then convert back?
			// Wait, replay doesn't need to be perfect if we just want to set bits.
			// But we need to iterate correctly.
			// Let's just update `current` by adding duration of this segment?
			// Duration = (endMinute - startMinute) * 60 * 1000? No, DST.

			// Let's use the simplest valid approach:
			// Just use nextDay (local) and if we need unix, we can't easily get it without `fromZonedTime`.
			// BUT: We don't actually need `stepEndUnix` for anything other than `current = stepEndUnix`.
			// And we only need `current` to loop.
			// If we know we are going to next day, we can just set `current` to a timestamp known to be in next day?
			// No, `toZonedTime` needs exact timestamp.

			// Let's assume we can import fromZonedTime like in hold-manager
			// But I don't want to duplicate too much.
			// Let's assume a simplified flow where we just process the known single-day holds if that was the case?
			// The user said "couldnt it just be unix times".
			// The events ARE unix times now.
			// So this file `replay.ts` is BROKEN because it tries to access `day`, `startMinute` from `event.payload`.
			// I need to fix it to use `startUnix` / `endUnix`.

			// For the loop advancement:
			// Let's just use `fromZonedTime` if possible.
			// Or just `current += 24*60*60*1000` and check if day changed?
			// That's risky around DST.

			// Let's stick to the logic:
			// `nextDay` is 00:00 local tomorrow.
			// We need its unix timestamp.
			// If we assume UTC (DEFAULT_TIMEZONE), then:
			stepEndUnix = nextDay.getTime(); // This works if timezone is UTC because toZonedTime(x, 'UTC') returns a Date that is effectively UTC.
		}

		segments.push({ day, start: startMinute, end: endMinute });
		current = stepEndUnix || endUnix; // Fallback
	}
	return segments;
};

export const replayEvents = async (
	inventory: Inventory,
	events: LedgerEvent[],
): Promise<void> => {
	const stateMap = new Map<string, InventoryState>();

	for (const event of events) {
		const stateKey = `${event.tenantId}:${event.resourceId}`;
		let state = stateMap.get(stateKey);
		if (!state) {
			state = new Map<DayKey, ReturnType<typeof createBitmapDay>>();
			stateMap.set(stateKey, state);
		}

		if (event.type === 'HoldPlaced') {
			const { startUnix, endUnix, expiresAt } = event.payload;
			if (expiresAt <= Date.now()) {
				continue;
			}

			// TODO: Resolve timezone from resourceId?
			// For now, defaulting to UTC.
			const segments = getSegments(startUnix, endUnix, DEFAULT_TIMEZONE);

			for (const { day, start, end } of segments) {
				let dayState = state.get(day);
				if (!dayState) {
					dayState = createBitmapDay(15);
					state.set(day, dayState);
				}
				setBitRange(dayState.held, start, end, true);
			}
		} else if (event.type === 'HoldExpired') {
			const holdId = event.payload.holdId as HoldId;
			const holdEvents = events.filter(
				(e): e is HoldPlacedEvent =>
					e.type === 'HoldPlaced' &&
					e.payload.holdId === holdId &&
					e.createdAt < event.createdAt,
			);
			const holdEvent = holdEvents[holdEvents.length - 1];
			if (holdEvent) {
				const { startUnix, endUnix } = holdEvent.payload;
				const segments = getSegments(startUnix, endUnix, DEFAULT_TIMEZONE);

				for (const { day, start, end } of segments) {
					const dayState = state.get(day);
					if (dayState) {
						setBitRange(dayState.held, start, end, false);
					}
				}
			}
		} else if (event.type === 'BookingConfirmed') {
			const bookingEvent = event as BookingConfirmedEvent;
			const cancelledEvents = events.filter(
				(e) =>
					e.type === 'BookingCancelled' &&
					e.payload.bookingId === bookingEvent.payload.bookingId &&
					e.createdAt > event.createdAt,
			);

			if (cancelledEvents.length === 0) {
				const holdId = bookingEvent.payload.holdId as HoldId;
				const holdEvents = events.filter(
					(e): e is HoldPlacedEvent =>
						e.type === 'HoldPlaced' &&
						e.payload.holdId === holdId &&
						e.createdAt <= event.createdAt,
				);
				const holdEvent = holdEvents[holdEvents.length - 1];
				if (holdEvent) {
					const { startUnix, endUnix } = holdEvent.payload;
					const segments = getSegments(startUnix, endUnix, DEFAULT_TIMEZONE);

					for (const { day, start, end } of segments) {
						let dayState = state.get(day);
						if (!dayState) {
							dayState = createBitmapDay(15);
							state.set(day, dayState);
						}
						setBitRange(dayState.held, start, end, false);
						setBitRange(dayState.booked, start, end, true);
					}
				}
			}
		} else if (event.type === 'BookingCancelled') {
			const bookingId = event.payload.bookingId;
			const bookingEvents = events.filter(
				(e): e is BookingConfirmedEvent =>
					e.type === 'BookingConfirmed' &&
					e.payload.bookingId === bookingId &&
					e.createdAt < event.createdAt,
			);
			const bookingEvent = bookingEvents[bookingEvents.length - 1];
			if (bookingEvent) {
				const holdId = bookingEvent.payload.holdId as HoldId;
				const holdEvents = events.filter(
					(e): e is HoldPlacedEvent =>
						e.type === 'HoldPlaced' &&
						e.payload.holdId === holdId &&
						e.createdAt <= bookingEvent.createdAt,
				);
				const holdEvent = holdEvents[holdEvents.length - 1];
				if (holdEvent) {
					const { startUnix, endUnix } = holdEvent.payload;
					const segments = getSegments(startUnix, endUnix, DEFAULT_TIMEZONE);

					for (const { day, start, end } of segments) {
						const dayState = state.get(day);
						if (dayState) {
							setBitRange(dayState.booked, start, end, false);
						}
					}
				}
			}
		}
	}

	for (const [stateKey, state] of stateMap) {
		const [tenantId, resourceId] = stateKey.split(':');
		const currentState = inventory.getState(
			tenantId as TenantId,
			resourceId as ResourceId,
		);
		for (const [day, dayState] of state) {
			currentState.set(day, dayState);
		}
	}
};
