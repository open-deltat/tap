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
import type { InventoryState } from '../inventory-types';

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
	getHoldById: (holdId: HoldId) => Promise<{
		tenantId: TenantId;
		resourceId: ResourceId;
		sessionId: SessionId;
		startUnix: number;
		endUnix: number;
		expiresAt: number;
	} | null>;
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
			const { tenantId, resourceId, holdId, sessionId } = params;
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

				const bookingInterval: Interval = {
					start: hold.startUnix,
					end: hold.endUnix,
					value: 1,
				};

				const allBusy = [
					...state.booked,
					...state.held.filter(
						(h) => !(h.start === hold.startUnix && h.end === hold.endUnix),
					),
				];
				const hasOverlap = allBusy.some(
					(busy) =>
						Math.max(busy.start, bookingInterval.start) <
						Math.min(busy.end, bookingInterval.end),
				);

				if (hasOverlap) {
					return null;
				}

				await deps.holdRepository.delete(holdId);

				await deps.bookingRepository.create({
					id: params.bookingId,
					tenantId,
					resourceId,
					holdId,
					start: params.start,
					end: params.end,
					status: 'CONFIRMED',
					paymentStatus: params.paymentStatus || 'NONE',
					...(params.customerName !== undefined && {
						customerName: params.customerName,
					}),
					...(params.customerEmail !== undefined && {
						customerEmail: params.customerEmail,
					}),
					...(params.customerPhone !== undefined && {
						customerPhone: params.customerPhone,
					}),
				});

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
				});
			} finally {
				release();
			}
		},

		cancelBooking: async (params) => {
			const { tenantId, resourceId, startUnix, endUnix, bookingId } = params;

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
