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
import type { Interval } from '../../infrastructure/intervals';
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
	getState: (
		tenantId: TenantId,
		resourceId: ResourceId,
	) => Promise<InventoryState>;
	getHoldById: (holdId: HoldId) => Promise<HoldMetadata | null>;
	holdRepository: {
		delete: (id: HoldId) => Promise<void>;
	};
	bookingRepository: {
		create: (booking: {
			id: BookingId;
			tenantId: TenantId;
			resourceId: ResourceId;
			holdId?: HoldId;
			start: number;
			end: number;
			status: 'CONFIRMED' | 'CANCELLED';
			paymentStatus: 'NONE' | 'PENDING' | 'PAID';
			customerName?: string;
			customerEmail?: string;
			customerPhone?: string;
		}) => Promise<void>;
		update: (
			id: BookingId,
			updates: Partial<{ status: 'CONFIRMED' | 'CANCELLED' }>,
		) => Promise<void>;
	};
	withLock: (key: string) => Promise<() => void>;
}): BookingManager => {
	return {
		confirmBooking: async (params) => {
			const {
				tenantId,
				resourceId,
				holdId,
				sessionId,
				bookingId,
				start,
				end,
				customerName,
				customerEmail,
				customerPhone,
				paymentStatus = 'NONE',
				priceCents,
			} = params;

			const hold = await deps.getHoldById(holdId);
			if (!hold) {
				return null;
			}
			if (hold.sessionId !== sessionId) {
				return null;
			}

			const lockKey = `${tenantId}:${resourceId}:inventory`;
			const release = await deps.withLock(lockKey);

			try {
				const currentHold = await deps.getHoldById(holdId);
				if (!currentHold || currentHold.sessionId !== sessionId) {
					return null;
				}

				const state = await deps.getState(tenantId, resourceId);

				const requestedInterval: Interval = {
					start,
					end,
					value: 1,
				};

				const hasOverlappingBooking = state.booked.some(
					(booking) =>
						Math.max(booking.start, requestedInterval.start) <
						Math.min(booking.end, requestedInterval.end),
				);

				if (hasOverlappingBooking) {
					return null;
				}

				await deps.holdRepository.delete(holdId);

				await deps.bookingRepository.create({
					id: bookingId,
					tenantId,
					resourceId,
					holdId,
					start,
					end,
					status: 'CONFIRMED',
					paymentStatus,
					...(customerName !== undefined && { customerName }),
					...(customerEmail !== undefined && { customerEmail }),
					...(customerPhone !== undefined && { customerPhone }),
				});

				return createEvent('BookingConfirmed', {
					tenantId,
					resourceId,
					holdId,
					bookingId,
					startUnix: start,
					endUnix: end,
					...(customerName !== undefined && { customerName }),
					...(customerEmail !== undefined && { customerEmail }),
					...(customerPhone !== undefined && { customerPhone }),
					...(paymentStatus !== undefined && { paymentStatus }),
					...(priceCents !== undefined && { priceCents }),
				});
			} finally {
				release();
			}
		},

		cancelBooking: async (params) => {
			const { tenantId, resourceId, bookingId, startUnix, endUnix } = params;

			const lockKey = `${tenantId}:${resourceId}:inventory`;
			const release = await deps.withLock(lockKey);

			try {
				await deps.bookingRepository.update(bookingId, {
					status: 'CANCELLED',
				});

				return createEvent('BookingCancelled', {
					tenantId,
					resourceId,
					bookingId,
					start: startUnix,
					end: endUnix,
				});
			} finally {
				release();
			}
		},
	};
};
