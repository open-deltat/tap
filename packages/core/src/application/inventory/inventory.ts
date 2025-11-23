import type {
	BookingId,
	DayKey,
	HoldId,
	Minute,
	ResourceId,
	SessionId,
	TenantId,
} from '@tap/protocol';
import type {
	BookingCancelledEvent,
	BookingConfirmedEvent,
	HoldExpiredEvent,
	HoldPlacedEvent,
	HoldReleasedEvent,
} from '../../domain/events';
import { createMutex } from '../../infrastructure/mutex';
import { createBookingManager } from './booking-manager';
import { createExpiryManager } from './expiry-manager';
import { createHoldManager } from './hold-manager';
import { createStateManager } from './state-manager';
import type { HoldMetadata, InventoryState } from './types';

export type Inventory = {
	placeHold: (params: {
		tenantId: TenantId;
		resourceId: ResourceId;
		sessionId: SessionId;
		timezone: string;
		startUnix: number;
		endUnix: number;
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
		startUnix: number;
		endUnix: number;
	}) => Promise<BookingCancelledEvent | null>;
	expireHolds: (now: number) => HoldExpiredEvent[];
	releaseHold: (params: {
		holdId: HoldId;
		sessionId: SessionId;
	}) => Promise<
		{ success: true; event: HoldReleasedEvent } | { success: false }
	>;
	releaseHoldsForSession: (sessionId: SessionId) => Promise<HoldExpiredEvent[]>;
	getState: (tenantId: TenantId, resourceId: ResourceId) => InventoryState;
};

export const createInventory = (): Inventory => {
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
