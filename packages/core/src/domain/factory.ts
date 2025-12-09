import type {
	BookingId,
	HoldId,
	ResourceId,
	TenantId,
} from '@open-tap/protocol';
import { eventId } from '@open-tap/protocol';
import { ulid } from 'ulid';
import type {
	BookingCancelledEvent,
	BookingConfirmedEvent,
	HoldExpiredEvent,
	HoldPlacedEvent,
	HoldReleasedEvent,
} from './events';

const createBase = (tenantId: TenantId, resourceId: ResourceId) => ({
	eventId: eventId(ulid()),
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

type AllEventParams =
	| Parameters<typeof createHoldPlacedEvent>[0]
	| Parameters<typeof createHoldExpiredEvent>[0]
	| Parameters<typeof createHoldReleasedEvent>[0]
	| Parameters<typeof createBookingConfirmedEvent>[0]
	| Parameters<typeof createBookingCancelledEvent>[0];

function isHoldPlacedParams(
	params: AllEventParams,
): params is Parameters<typeof createHoldPlacedEvent>[0] {
	return (
		'expiresAt' in params &&
		'startUnix' in params &&
		'endUnix' in params &&
		!('bookingId' in params)
	);
}

function isHoldExpiredParams(
	params: AllEventParams,
): params is Parameters<typeof createHoldExpiredEvent>[0] {
	return (
		'holdId' in params &&
		!('expiresAt' in params) &&
		!('bookingId' in params) &&
		!('start' in params)
	);
}

function isHoldReleasedParams(
	params: AllEventParams,
): params is Parameters<typeof createHoldReleasedEvent>[0] {
	return (
		'holdId' in params &&
		!('expiresAt' in params) &&
		!('bookingId' in params) &&
		!('start' in params)
	);
}

function isBookingConfirmedParams(
	params: AllEventParams,
): params is Parameters<typeof createBookingConfirmedEvent>[0] {
	return (
		'bookingId' in params &&
		'holdId' in params &&
		'start' in params &&
		'end' in params
	);
}

function isBookingCancelledParams(
	params: AllEventParams,
): params is Parameters<typeof createBookingCancelledEvent>[0] {
	return (
		'bookingId' in params && !('holdId' in params) && !('expiresAt' in params)
	);
}

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
	type:
		| 'HoldPlaced'
		| 'HoldExpired'
		| 'HoldReleased'
		| 'BookingConfirmed'
		| 'BookingCancelled',
	params: AllEventParams,
):
	| HoldPlacedEvent
	| HoldExpiredEvent
	| HoldReleasedEvent
	| BookingConfirmedEvent
	| BookingCancelledEvent {
	if (type === 'HoldPlaced' && isHoldPlacedParams(params)) {
		return createHoldPlacedEvent(params);
	}
	if (type === 'HoldExpired' && isHoldExpiredParams(params)) {
		return createHoldExpiredEvent(params);
	}
	if (type === 'HoldReleased' && isHoldReleasedParams(params)) {
		return createHoldReleasedEvent(params);
	}
	if (type === 'BookingConfirmed' && isBookingConfirmedParams(params)) {
		return createBookingConfirmedEvent(params);
	}
	if (type === 'BookingCancelled' && isBookingCancelledParams(params)) {
		return createBookingCancelledEvent(params);
	}
	throw new Error(`Invalid event type/params combination: ${type}`);
}
