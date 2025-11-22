import type {
	BookingConfirmedEvent,
	HoldPlacedEvent,
	LedgerEvent,
} from '../domain/events';
import type { DayKey, HoldId, ResourceId, TenantId } from '../domain/ids';
import { createBitmapDay, setBitRange } from '../infrastructure/bitmap';
import type { Inventory } from './inventory/inventory';
import type { AllocatorState } from './inventory/types';

export const replayEvents = async (
	inventory: Inventory,
	events: LedgerEvent[],
): Promise<void> => {
	const stateMap = new Map<string, AllocatorState>();

	for (const event of events) {
		const stateKey = `${event.tenantId}:${event.resourceId}`;
		let state = stateMap.get(stateKey);
		if (!state) {
			state = new Map<DayKey, ReturnType<typeof createBitmapDay>>();
			stateMap.set(stateKey, state);
		}

		if (event.type === 'HoldPlaced') {
			const { day, startMinute, endMinute, expiresAt } = event.payload;
			if (expiresAt <= Date.now()) {
				continue;
			}
			let dayState = state.get(day);
			if (!dayState) {
				dayState = createBitmapDay(15);
				state.set(day, dayState);
			}
			setBitRange(dayState.held, startMinute, endMinute, true);
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
				const { day, startMinute, endMinute } = holdEvent.payload;
				const dayState = state.get(day);
				if (dayState) {
					setBitRange(dayState.held, startMinute, endMinute, false);
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
					const { day, startMinute, endMinute } = holdEvent.payload;
					let dayState = state.get(day);
					if (!dayState) {
						dayState = createBitmapDay(15);
						state.set(day, dayState);
					}
					setBitRange(dayState.held, startMinute, endMinute, false);
					setBitRange(dayState.booked, startMinute, endMinute, true);
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
					const { day, startMinute, endMinute } = holdEvent.payload;
					const dayState = state.get(day);
					if (dayState) {
						setBitRange(dayState.booked, startMinute, endMinute, false);
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
