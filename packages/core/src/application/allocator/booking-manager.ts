import type { BookingConfirmedEvent } from '../../domain/events';
import type { BookingId, HoldId, ResourceId, TenantId } from '../../domain/ids';
import { getBit, setBitRange } from '../../infrastructure/bitmap';
import { createBookingConfirmedEvent } from '../event-factory';
import type { AllocatorState, HoldMetadata } from './types';

export type BookingManager = {
	confirmBooking: (params: {
		tenantId: TenantId;
		resourceId: ResourceId;
		holdId: HoldId;
		bookingId: BookingId;
		customerEmail?: string;
		priceCents?: number;
	}) => Promise<BookingConfirmedEvent | null>;
};

export const createBookingManager = (params: {
	getState: (tenantId: TenantId, resourceId: ResourceId) => AllocatorState;
	holds: Map<HoldId, HoldMetadata>;
	withLock: (key: string) => Promise<() => void>;
}): BookingManager => {
	return {
		confirmBooking: async ({
			tenantId,
			resourceId,
			holdId,
			bookingId,
			customerEmail,
			priceCents,
		}) => {
			const hold = params.holds.get(holdId);
			if (!hold) {
				return null;
			}

			const lockKey = `${tenantId}:${resourceId}:${hold.day}`;
			const release = await params.withLock(lockKey);
			try {
				const dayMap = params.getState(tenantId, resourceId);
				const dayState = dayMap.get(hold.day);
				if (!dayState) {
					params.holds.delete(holdId);
					return null;
				}

				for (let m = hold.start; m < hold.end; m++) {
					if (getBit(dayState.booked, m)) {
						params.holds.delete(holdId);
						return null;
					}
					if (!getBit(dayState.held, m)) {
						params.holds.delete(holdId);
						return null;
					}
				}

				setBitRange(dayState.held, hold.start, hold.end, false);
				setBitRange(dayState.booked, hold.start, hold.end, true);
				params.holds.delete(holdId);

				const event = createBookingConfirmedEvent({
					tenantId,
					resourceId,
					bookingId,
					holdId,
					customerEmail,
					priceCents,
				});

				return event;
			} finally {
				release();
			}
		},
	};
};
