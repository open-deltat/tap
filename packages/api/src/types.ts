import type { BookingId, HoldId, ResourceId, TenantId } from '@tap/core';

export type ApiContext = {
	tenantId?: TenantId;
	resourceId?: ResourceId;
	clientId?: string;
};

export type AvailabilityQuery = {
	from: string;
	to: string;
	durationMinutes?: number;
};

export type AvailabilitySlot = {
	start: number;
	end: number;
};

export type PlaceHoldRequest = {
	day: string;
	startMinute: number;
	endMinute: number;
	expiresAtMs?: number;
	clientRef?: string;
};

export type ConfirmBookingRequest = {
	holdId: HoldId;
	bookingId?: BookingId;
	start?: number | string;
	end?: number | string;
	customerName?: string;
	customerEmail?: string;
	customerPhone?: string;
	paymentStatus?: 'NONE' | 'PENDING' | 'PAID';
	priceCents?: number;
};

export type PublicBookRequest = {
	start: string;
	end: string;
	customerName: string;
	customerEmail: string;
	customerPhone?: string;
	paymentMethod?: string;
};
