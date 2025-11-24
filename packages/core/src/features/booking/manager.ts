import type {
	BookingId,
	HoldId,
	ResourceId,
	SessionId,
	TenantId,
} from '@tap/protocol';
import type {
	BookingCancelledEvent,
	BookingConfirmedEvent,
} from '../../domain/events';
import { createEvent } from '../../domain/factory';
import {
	type Interval,
	mergeIntervals,
	subtractInterval,
} from '../../infrastructure/intervals';
import type { HoldMetadata, InventoryState } from '../inventory-types';

export type BookingManager = {
	confirmBooking: (params: {
		tenantId: TenantId;
		resourceId: ResourceId;
		holdId: HoldId;
		sessionId: SessionId;
		bookingId: BookingId;
		start: number;
		end: number;
		customerName?: string;
		customerEmail?: string;
		customerPhone?: string;
		paymentStatus?: 'NONE' | 'PENDING' | 'PAID';
		priceCents?: number;
	}) => Promise<BookingConfirmedEvent | null>;
	cancelBooking: (params: {
		tenantId: TenantId;
		resourceId: ResourceId;
		bookingId: BookingId;
		startUnix: number;
		endUnix: number;
	}) => Promise<BookingCancelledEvent | null>;
};

export const createBookingManager = (deps: {
	getState: (tenantId: TenantId, resourceId: ResourceId) => InventoryState;
	holds: Map<HoldId, HoldMetadata>;
	withLock: (key: string) => Promise<() => void>;
}): BookingManager => {
	return {
		confirmBooking: async (params) => {
			const { tenantId, resourceId, holdId, sessionId } = params;
			const hold = deps.holds.get(holdId);
			if (!hold) {
				return null;
			}
			if (hold.sessionId !== sessionId) {
				return null;
			}

			const lockKey = `${tenantId}:${resourceId}:inventory`;
			const release = await deps.withLock(lockKey);

			try {
				// Verify hold still exists after lock
				if (!deps.holds.has(holdId)) {
					return null;
				}

				const state = deps.getState(tenantId, resourceId);

				// 1. Find the hold interval in state.held
				//    Since holds are merged in state, we need to find the interval that covers this hold range.
				//    BUT, wait. Holds are distinct entities for expiration.
				//    In `inventory-types`, `held` is a list of Intervals.
				//    To move capacity from Held to Booked, we subtract from Held and add to Booked.

				const bookingInterval: Interval = {
					start: hold.startUnix,
					end: hold.endUnix,
					value: 1, // Assuming capacity 1 for now, or fetch from hold metadata if available
				};

				// Remove from Held
				// This is tricky if `state.held` contains merged intervals.
				// If we want to remove EXACTLY this hold's contribution, we need to know its original interval.
				// Since we are just using a flat list of intervals for now, we can subtract it.
				// Actually, for capacity management, we should just remove the specific interval we added.
				// But if they are merged, we subtract.

				// Simpler approach for V1 (List of intervals):
				// Just filter out the interval? No, timestamps might be merged.
				// Let's implement `removeFromList` helper or just subtract.
				// Subtracting `bookingInterval` from `state.held` is correct.

				const newHeld: Interval[] = [];
				for (const interval of state.held) {
					newHeld.push(...subtractInterval(interval, bookingInterval));
				}
				state.held = newHeld;

				// Add to Booked
				state.booked.push(bookingInterval);
				// Optional: Clean up/merge booked intervals to keep list small
				state.booked = mergeIntervals(state.booked);

				// Remove the hold metadata
				deps.holds.delete(holdId);

				return createEvent('BookingConfirmed', {
					tenantId,
					resourceId,
					holdId,
					bookingId: params.bookingId,
					start: params.start,
					end: params.end,
					...(params.customerName !== undefined && {
						customerName: params.customerName,
					}),
					...(params.customerEmail !== undefined && {
						customerEmail: params.customerEmail,
					}),
					...(params.customerPhone !== undefined && {
						customerPhone: params.customerPhone,
					}),
					...(params.paymentStatus !== undefined && {
						paymentStatus: params.paymentStatus,
					}),
					...(params.priceCents !== undefined && {
						priceCents: params.priceCents,
					}),
				}) as BookingConfirmedEvent;
			} finally {
				release();
			}
		},

		cancelBooking: async (params) => {
			const { tenantId, resourceId, startUnix, endUnix, bookingId } = params;

			const lockKey = `${tenantId}:${resourceId}:inventory`;
			const release = await deps.withLock(lockKey);

			try {
				const state = deps.getState(tenantId, resourceId);

				const bookingInterval: Interval = {
					start: startUnix,
					end: endUnix,
					value: 1,
				};

				// Remove from Booked
				const newBooked: Interval[] = [];
				for (const interval of state.booked) {
					newBooked.push(...subtractInterval(interval, bookingInterval));
				}
				state.booked = newBooked;

				return createEvent('BookingCancelled', {
					tenantId,
					resourceId,
					bookingId,
					start: startUnix,
					end: endUnix,
				}) as BookingCancelledEvent;
			} finally {
				release();
			}
		},
	};
};
