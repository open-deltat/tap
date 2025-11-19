import type {
	BookingCancelledEvent,
	BookingConfirmedEvent,
	HoldExpiredEvent,
	HoldPlacedEvent,
	HoldReleasedEvent,
} from '../../domain/events';
import type {
	BookingId,
	DayKey,
	HoldId,
	Minute,
	ResourceId,
	SessionId,
	TenantId,
} from '../../domain/ids';
import { createMutex } from '../../infrastructure/mutex';
import { createBookingManager } from './booking-manager';
import { createExpiryManager } from './expiry-manager';
import { createHoldManager } from './hold-manager';
import { createStateManager } from './state-manager';
import type { AllocatorState, HoldMetadata } from './types';

export type Allocator = {
	placeHold: (params: {
		tenantId: TenantId;
		resourceId: ResourceId;
		sessionId: SessionId;
		day: DayKey;
		startMinute: Minute;
		endMinute: Minute;
		expiresAt: number;
		clientRef?: string;
	}) => Promise<
		| { success: true; holdId: HoldId; event: HoldPlacedEvent }
		| { success: false }
	>;
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
		day: DayKey;
		startMinute: Minute;
		endMinute: Minute;
	}) => Promise<BookingCancelledEvent | null>;
	expireHolds: (now: number) => HoldExpiredEvent[];
	releaseHold: (params: {
		holdId: HoldId;
		sessionId: SessionId;
	}) => Promise<{ success: true; event: HoldReleasedEvent } | { success: false }>;
	releaseHoldsForSession: (sessionId: SessionId) => Promise<HoldExpiredEvent[]>;
	getState: (tenantId: TenantId, resourceId: ResourceId) => AllocatorState;
};

export const createAllocator = (): Allocator => {
	const { manager } = createStateManager();
	const holds = new Map<HoldId, HoldMetadata>();
	const withLock = createMutex();

	const holdManager = createHoldManager({
		getState: manager.getState,
		holds,
		withLock,
	});

	const bookingManager = createBookingManager({
		getState: manager.getState,
		holds,
		withLock,
	});

	const expiryManager = createExpiryManager({
		getState: manager.getState,
		holds,
	});

	return {
		getState: manager.getState,
		placeHold: holdManager.placeHold,
		confirmBooking: bookingManager.confirmBooking,
		cancelBooking: bookingManager.cancelBooking,
		expireHolds: expiryManager.expireHolds,
		releaseHold: holdManager.releaseHold,
		releaseHoldsForSession: holdManager.releaseHoldsForSession,
	};
};
