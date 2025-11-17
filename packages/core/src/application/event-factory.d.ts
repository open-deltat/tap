import type {
	BookingCancelledEvent,
	BookingConfirmedEvent,
	HoldExpiredEvent,
	HoldPlacedEvent,
} from '../domain/events';
import type {
	BookingId,
	DayKey,
	HoldId,
	Minute,
	ResourceId,
	TenantId,
} from '../domain/ids';
export declare const createHoldPlacedEvent: (params: {
	tenantId: TenantId;
	resourceId: ResourceId;
	holdId: HoldId;
	day: DayKey;
	startMinute: Minute;
	endMinute: Minute;
	expiresAt: number;
	clientRef?: string;
}) => HoldPlacedEvent;
export declare const createBookingConfirmedEvent: (params: {
	tenantId: TenantId;
	resourceId: ResourceId;
	bookingId: BookingId;
	holdId: HoldId;
	start: number;
	end: number;
	customerName?: string;
	customerEmail?: string;
	customerPhone?: string;
	paymentStatus?: 'NONE' | 'PENDING' | 'PAID';
	priceCents?: number;
}) => BookingConfirmedEvent;
export declare const createBookingCancelledEvent: (params: {
	tenantId: TenantId;
	resourceId: ResourceId;
	bookingId: BookingId;
}) => BookingCancelledEvent;
export declare const createHoldExpiredEvent: (params: {
	tenantId: TenantId;
	resourceId: ResourceId;
	holdId: HoldId;
}) => HoldExpiredEvent;
//# sourceMappingURL=event-factory.d.ts.map
