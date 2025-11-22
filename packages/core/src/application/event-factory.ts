import type {
	BookingId,
	DayKey,
	EventId,
	HoldId,
	Minute,
	ResourceId,
	TenantId,
} from '@tap/protocol';
import { ulid } from 'ulid';
import type {
	BookingCancelledEvent,
	BookingConfirmedEvent,
	HoldExpiredEvent,
	HoldPlacedEvent,
	HoldReleasedEvent,
} from '../domain/events';

export const createHoldPlacedEvent = (params: {
	tenantId: TenantId;
	resourceId: ResourceId;
	holdId: HoldId;
	day: DayKey;
	startMinute: Minute;
	endMinute: Minute;
	expiresAt: number;
	clientRef?: string;
}): HoldPlacedEvent => ({
	eventId: ulid() as EventId,
	tenantId: params.tenantId,
	resourceId: params.resourceId,
	type: 'HoldPlaced',
	version: 1,
	createdAt: Date.now(),
	payload: {
		holdId: params.holdId,
		day: params.day,
		startMinute: params.startMinute,
		endMinute: params.endMinute,
		expiresAt: params.expiresAt,
		clientRef: params.clientRef,
	},
});

export const createBookingConfirmedEvent = (params: {
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
}): BookingConfirmedEvent => ({
	eventId: ulid() as EventId,
	tenantId: params.tenantId,
	resourceId: params.resourceId,
	type: 'BookingConfirmed',
	version: 1,
	createdAt: Date.now(),
	payload: {
		bookingId: params.bookingId,
		holdId: params.holdId,
		start: params.start,
		end: params.end,
		customerName: params.customerName,
		customerEmail: params.customerEmail,
		customerPhone: params.customerPhone,
		paymentStatus: params.paymentStatus,
		priceCents: params.priceCents,
	},
});

export const createBookingCancelledEvent = (params: {
	tenantId: TenantId;
	resourceId: ResourceId;
	bookingId: BookingId;
	start: number;
	end: number;
}): BookingCancelledEvent => ({
	eventId: ulid() as EventId,
	tenantId: params.tenantId,
	resourceId: params.resourceId,
	type: 'BookingCancelled',
	version: 1,
	createdAt: Date.now(),
	payload: {
		bookingId: params.bookingId,
		start: params.start,
		end: params.end,
	},
});

export const createHoldExpiredEvent = (params: {
	tenantId: TenantId;
	resourceId: ResourceId;
	holdId: HoldId;
	day: DayKey;
	startMinute: Minute;
	endMinute: Minute;
}): HoldExpiredEvent => ({
	eventId: ulid() as EventId,
	tenantId: params.tenantId,
	resourceId: params.resourceId,
	type: 'HoldExpired',
	version: 1,
	createdAt: Date.now(),
	payload: {
		holdId: params.holdId,
		day: params.day,
		startMinute: params.startMinute,
		endMinute: params.endMinute,
	},
});

export const createHoldReleasedEvent = (params: {
	tenantId: TenantId;
	resourceId: ResourceId;
	holdId: HoldId;
	day: DayKey;
	startMinute: Minute;
	endMinute: Minute;
}): HoldReleasedEvent => ({
	eventId: ulid() as EventId,
	tenantId: params.tenantId,
	resourceId: params.resourceId,
	type: 'HoldReleased',
	version: 1,
	createdAt: Date.now(),
	payload: {
		holdId: params.holdId,
		day: params.day,
		startMinute: params.startMinute,
		endMinute: params.endMinute,
	},
});
