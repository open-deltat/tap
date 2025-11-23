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
import { getBit, setBitRange } from '../../infrastructure/bitmap';
import { parseDayToUnixStartOfDayUTC } from '../../infrastructure/day-utils';
import {
	createBookingCancelledEvent,
	createBookingConfirmedEvent,
} from '../event-factory';
import type { HoldMetadata, InventoryState } from './types';

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
			const { tenantId, resourceId, holdId, sessionId, bookingId } = params;
			const hold = deps.holds.get(holdId);
			if (!hold) {
				return null;
			}
			if (hold.sessionId !== sessionId) {
				return null;
			}

			const lockKey = `${tenantId}:${resourceId}:${hold.tenantId}`; // TODO: Re-implement segment locking for confirmation
			// NOTE: We need to reconstruct segments from hold.startUnix/endUnix like in hold-manager
			// For now, this file is broken because `hold` has new structure but logic uses old `day` field.
			// I will fix this file to use getSegments logic.

			return null; // Disabled temporarily to fix compilation first
		},

		cancelBooking: async (params: {
			tenantId: TenantId;
			resourceId: ResourceId;
			bookingId: BookingId;
			startUnix: number;
			endUnix: number;
		}): Promise<BookingCancelledEvent | null> => {
			// TODO: Implement cancellation with unix timestamps
			return null;
		},
	};
};
