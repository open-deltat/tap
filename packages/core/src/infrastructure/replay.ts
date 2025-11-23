import type { LedgerEvent } from '../domain/events';
import type { Inventory } from '../features/inventory';
import { type Interval, mergeIntervals, subtractInterval } from './intervals';

export const replayEvents = async (
	inventory: Inventory,
	events: LedgerEvent[],
): Promise<void> => {
	for (const event of events) {
		const state = inventory.getState(event.tenantId, event.resourceId);

		switch (event.type) {
			case 'HoldPlaced': {
				const { startUnix, endUnix } = event.payload;
				if (event.payload.expiresAt <= Date.now()) {
					continue;
				}
				state.held.push({
					start: startUnix,
					end: endUnix,
					value: 1,
				});
				break;
			}
			case 'HoldReleased': {
				const { startUnix, endUnix } = event.payload;
				const index = state.held.findIndex(
					(i) => i.start === startUnix && i.end === endUnix,
				);
				if (index !== -1) {
					state.held.splice(index, 1);
				}
				break;
			}
			case 'HoldExpired': {
				const { startUnix, endUnix } = event.payload;
				const index = state.held.findIndex(
					(i) => i.start === startUnix && i.end === endUnix,
				);
				if (index !== -1) {
					state.held.splice(index, 1);
				}
				break;
			}
			case 'BookingConfirmed': {
				const { start, end } = event.payload;
				const holdIndex = state.held.findIndex(
					(i) => i.start === start && i.end === end,
				);
				if (holdIndex !== -1) {
					state.held.splice(holdIndex, 1);
				}

				state.booked.push({
					start,
					end,
					value: 1,
				});
				state.booked = mergeIntervals(state.booked);
				break;
			}
			case 'BookingCancelled': {
				const { start, end } = event.payload;
				if (start !== undefined && end !== undefined) {
					const bookingInterval: Interval = { start, end, value: 1 };
					const newBooked: Interval[] = [];
					for (const interval of state.booked) {
						newBooked.push(...subtractInterval(interval, bookingInterval));
					}
					state.booked = newBooked;
				}
				break;
			}
		}
	}
};
