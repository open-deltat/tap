import type {
	BookingCancelledEvent,
	BookingConfirmedEvent,
} from '../../domain/events';
import type { BookingId, HoldId, ResourceId, TenantId } from '../../domain/ids';
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
	cancelBooking: (params: {
		tenantId: TenantId;
		resourceId: ResourceId;
		bookingId: BookingId;
		day: string;
		startMinute: number;
		endMinute: number;
	}) => Promise<BookingCancelledEvent | null>;
};
export declare const createBookingManager: (deps: {
	getState: (tenantId: TenantId, resourceId: ResourceId) => AllocatorState;
	holds: Map<HoldId, HoldMetadata>;
	withLock: (key: string) => Promise<() => void>;
}) => BookingManager;
//# sourceMappingURL=booking-manager.d.ts.map
