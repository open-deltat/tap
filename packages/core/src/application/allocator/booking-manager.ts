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
		start: number;
		end: number;
		customerName?: string;
		customerEmail?: string;
		customerPhone?: string;
		paymentStatus?: 'NONE' | 'PENDING' | 'PAID';
		priceCents?: number;
	}) => Promise<BookingConfirmedEvent | null>;
};

export const createBookingManager = (deps: {
	getState: (tenantId: TenantId, resourceId: ResourceId) => AllocatorState;
	holds: Map<HoldId, HoldMetadata>;
	withLock: (key: string) => Promise<() => void>;
}): BookingManager => {
	return {
		confirmBooking: async (params) => {
			const { tenantId, resourceId, holdId, bookingId } = params;
			const hold = deps.holds.get(holdId);
			if (!hold) {
				return null;
			}

			const lockKey = `${tenantId}:${resourceId}:${hold.day}`;
			const release = await deps.withLock(lockKey);
			try {
				const dayMap = deps.getState(tenantId, resourceId);
				const dayState = dayMap.get(hold.day);
				if (!dayState) {
					deps.holds.delete(holdId);
					return null;
				}

				for (let m = hold.start; m < hold.end; m++) {
					if (getBit(dayState.booked, m)) {
						deps.holds.delete(holdId);
						return null;
					}
					if (!getBit(dayState.held, m)) {
						deps.holds.delete(holdId);
						return null;
					}
				}

				setBitRange(dayState.held, hold.start, hold.end, false);
				setBitRange(dayState.booked, hold.start, hold.end, true);
				deps.holds.delete(holdId);

				const dayStart = new Date(hold.day).setHours(0, 0, 0, 0);
				const start = dayStart + hold.start * 60 * 1000;
				const end = dayStart + hold.end * 60 * 1000;

				const event = createBookingConfirmedEvent({
					tenantId,
					resourceId,
					bookingId,
					holdId,
					start,
					end,
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
				});

				return event;
			} finally {
				release();
			}
		},
	};
};
