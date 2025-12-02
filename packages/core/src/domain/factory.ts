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
	ResourceCreatedEvent,
} from './events';

type EventBase = {
	eventId: EventId;
	tenantId: TenantId;
	resourceId: ResourceId;
	version: 1;
	createdAt: number;
};

const createBase = (tenantId: TenantId, resourceId: ResourceId): EventBase => ({
	eventId: ulid() as EventId,
	tenantId,
	resourceId,
	version: 1,
	createdAt: Date.now(),
});

type EventPayloads = {
	ResourceCreated: ResourceCreatedEvent['payload'];
	HoldPlaced: HoldPlacedEvent['payload'];
	HoldExpired: HoldExpiredEvent['payload'];
	HoldReleased: HoldReleasedEvent['payload'];
	BookingConfirmed: BookingConfirmedEvent['payload'];
	BookingCancelled: BookingCancelledEvent['payload'];
};

type EventByType = {
	ResourceCreated: ResourceCreatedEvent;
	HoldPlaced: HoldPlacedEvent;
	HoldExpired: HoldExpiredEvent;
	HoldReleased: HoldReleasedEvent;
	BookingConfirmed: BookingConfirmedEvent;
	BookingCancelled: BookingCancelledEvent;
};

export function createEvent(
	type: 'HoldPlaced',
	params: {
		tenantId: TenantId;
		resourceId: ResourceId;
		holdId: HoldId;
		startUnix: number;
		endUnix: number;
		expiresAt: number;
		clientRef?: string;
	},
): HoldPlacedEvent;

export function createEvent(
	type: 'HoldExpired',
	params: {
		tenantId: TenantId;
		resourceId: ResourceId;
		holdId: HoldId;
		startUnix?: number;
		endUnix?: number;
	},
): HoldExpiredEvent;

export function createEvent(
	type: 'HoldReleased',
	params: {
		tenantId: TenantId;
		resourceId: ResourceId;
		holdId: HoldId;
		startUnix?: number;
		endUnix?: number;
	},
): HoldReleasedEvent;

export function createEvent(
	type: 'BookingConfirmed',
	params: {
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
	},
): BookingConfirmedEvent;

export function createEvent(
	type: 'BookingCancelled',
	params: {
		tenantId: TenantId;
		resourceId: ResourceId;
		bookingId: BookingId;
		start?: number;
		end?: number;
	},
): BookingCancelledEvent;

export function createEvent<T extends keyof EventPayloads>(
	type: T,
	params: { tenantId: TenantId; resourceId: ResourceId } & EventPayloads[T],
): EventByType[T] {
	const { tenantId, resourceId, ...payload } = params;
	const base = createBase(tenantId, resourceId);

	return {
		...base,
		type,
		payload,
	} as EventByType[T];
}
