import type {
	BookingCancelledEvent,
	BookingConfirmedEvent,
	HoldPlacedEvent,
} from '../../domain/events';
import type {
	BookingId,
	DayKey,
	HoldId,
	Minute,
	ResourceId,
	TenantId,
} from '../../domain/ids';
import type { AllocatorState } from './types';
export type Allocator = {
	placeHold: (params: {
		tenantId: TenantId;
		resourceId: ResourceId;
		day: DayKey;
		startMinute: Minute;
		endMinute: Minute;
		expiresAt: number;
		clientRef?: string;
	}) => Promise<
		| {
				success: true;
				holdId: HoldId;
				event: HoldPlacedEvent;
		  }
		| {
				success: false;
		  }
	>;
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
		day: DayKey;
		startMinute: Minute;
		endMinute: Minute;
	}) => Promise<BookingCancelledEvent | null>;
	expireHolds: (now: number) => HoldId[];
	getState: (tenantId: TenantId, resourceId: ResourceId) => AllocatorState;
};
export declare const createAllocator: () => Allocator;
//# sourceMappingURL=allocator.d.ts.map
