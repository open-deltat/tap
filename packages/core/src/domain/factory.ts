import type {
	BookingId,
	EventId,
	HoldId,
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
} from './events';

const createBase = (tenantId: TenantId, resourceId: ResourceId) => ({
	eventId: ulid() as EventId,
	tenantId,
	resourceId,
	version: 1 as const,
	createdAt: Date.now(),
});

export const createHoldPlacedEvent = (params: {
	tenantId: TenantId;
	resourceId: ResourceId;
	holdId: HoldId;
	startUnix: number;
	endUnix: number;
	expiresAt: number;
	clientRef?: string;
}): HoldPlacedEvent => {
	const {
		tenantId,
		resourceId,
		holdId,
		startUnix,
		endUnix,
		expiresAt,
		clientRef,
	} = params;
	return {
		...createBase(tenantId, resourceId),
		type: 'HoldPlaced',
		payload: {
			holdId,
			startUnix,
			endUnix,
			expiresAt,
			...(clientRef !== undefined && { clientRef }),
		},
	};
};

export const createHoldExpiredEvent = (params: {
	tenantId: TenantId;
	resourceId: ResourceId;
	holdId: HoldId;
	startUnix?: number;
	endUnix?: number;
}): HoldExpiredEvent => {
	const { tenantId, resourceId, holdId, startUnix, endUnix } = params;
	return {
		...createBase(tenantId, resourceId),
		type: 'HoldExpired',
		payload: {
			holdId,
			...(startUnix !== undefined && { startUnix }),
			...(endUnix !== undefined && { endUnix }),
		},
	};
};

export const createHoldReleasedEvent = (params: {
	tenantId: TenantId;
	resourceId: ResourceId;
	holdId: HoldId;
	startUnix?: number;
	endUnix?: number;
}): HoldReleasedEvent => {
	const { tenantId, resourceId, holdId, startUnix, endUnix } = params;
	return {
		...createBase(tenantId, resourceId),
		type: 'HoldReleased',
		payload: {
			holdId,
			...(startUnix !== undefined && { startUnix }),
			...(endUnix !== undefined && { endUnix }),
		},
	};
};

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
}): BookingConfirmedEvent => {
	const { tenantId, resourceId, bookingId, holdId, start, end, ...optional } =
		params;
	return {
		...createBase(tenantId, resourceId),
		type: 'BookingConfirmed',
		payload: {
			bookingId,
			holdId,
			start,
			end,
			...(optional.customerName !== undefined && {
				customerName: optional.customerName,
			}),
			...(optional.customerEmail !== undefined && {
				customerEmail: optional.customerEmail,
			}),
			...(optional.customerPhone !== undefined && {
				customerPhone: optional.customerPhone,
			}),
			...(optional.paymentStatus !== undefined && {
				paymentStatus: optional.paymentStatus,
			}),
			...(optional.priceCents !== undefined && {
				priceCents: optional.priceCents,
			}),
		},
	};
};

export const createBookingCancelledEvent = (params: {
	tenantId: TenantId;
	resourceId: ResourceId;
	bookingId: BookingId;
	start?: number;
	end?: number;
}): BookingCancelledEvent => {
	const { tenantId, resourceId, bookingId, start, end } = params;
	return {
		...createBase(tenantId, resourceId),
		type: 'BookingCancelled',
		payload: {
			bookingId,
			...(start !== undefined && { start }),
			...(end !== undefined && { end }),
		},
	};
};

// Unified createEvent function for backwards compatibility
export function createEvent(
	type: 'HoldPlaced',
	params: Parameters<typeof createHoldPlacedEvent>[0],
): HoldPlacedEvent;
export function createEvent(
	type: 'HoldExpired',
	params: Parameters<typeof createHoldExpiredEvent>[0],
): HoldExpiredEvent;
export function createEvent(
	type: 'HoldReleased',
	params: Parameters<typeof createHoldReleasedEvent>[0],
): HoldReleasedEvent;
export function createEvent(
	type: 'BookingConfirmed',
	params: Parameters<typeof createBookingConfirmedEvent>[0],
): BookingConfirmedEvent;
export function createEvent(
	type: 'BookingCancelled',
	params: Parameters<typeof createBookingCancelledEvent>[0],
): BookingCancelledEvent;
export function createEvent(
	type: string,
	params: { tenantId: TenantId; resourceId: ResourceId } & Record<
		string,
		unknown
	>,
):
	| HoldPlacedEvent
	| HoldExpiredEvent
	| HoldReleasedEvent
	| BookingConfirmedEvent
	| BookingCancelledEvent {
	switch (type) {
		case 'HoldPlaced':
			return createHoldPlacedEvent(
				params as Parameters<typeof createHoldPlacedEvent>[0],
			);
		case 'HoldExpired':
			return createHoldExpiredEvent(
				params as Parameters<typeof createHoldExpiredEvent>[0],
			);
		case 'HoldReleased':
			return createHoldReleasedEvent(
				params as Parameters<typeof createHoldReleasedEvent>[0],
			);
		case 'BookingConfirmed':
			return createBookingConfirmedEvent(
				params as Parameters<typeof createBookingConfirmedEvent>[0],
			);
		case 'BookingCancelled':
			return createBookingCancelledEvent(
				params as Parameters<typeof createBookingCancelledEvent>[0],
			);
		default:
			throw new Error(`Unknown event type: ${type}`);
	}
}
