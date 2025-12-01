import type {
	BookingId,
	HoldId,
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
} from '../domain/events';
import { createMutex } from '../infrastructure/mutex';
import { createBookingManager } from './booking/manager';
import { createExpiryManager } from './hold/expiry';
import { createHoldManager } from './hold/manager';
import type { InventoryState } from './inventory-types';

export type DbStateManager = {
	getState: (
		tenantId: TenantId,
		resourceId: ResourceId,
	) => Promise<InventoryState>;
	getHoldById: (holdId: HoldId) => Promise<{
		tenantId: TenantId;
		resourceId: ResourceId;
		sessionId: SessionId;
		startUnix: number;
		endUnix: number;
		expiresAt: number;
	} | null>;
	getHoldsBySession: (sessionId: SessionId) => Promise<
		Array<{
			holdId: HoldId;
			tenantId: TenantId;
			resourceId: ResourceId;
			startUnix: number;
			endUnix: number;
			expiresAt: number;
		}>
	>;
	holdRepository: {
		create: (hold: {
			id: HoldId;
			tenantId: TenantId;
			resourceId: ResourceId;
			sessionId: SessionId;
			startUnix: number;
			endUnix: number;
			expiresAt: number;
			clientRef?: string;
		}) => Promise<void>;
		delete: (id: HoldId) => Promise<void>;
		getExpired: (now: number) => Promise<
			Array<{
				id: HoldId;
				tenantId: TenantId;
				resourceId: ResourceId;
				startUnix: number;
				endUnix: number;
				expiresAt: number;
			}>
		>;
	};
	bookingRepository: {
		create: (booking: {
			id: BookingId;
			tenantId: TenantId;
			resourceId: ResourceId;
			holdId?: HoldId;
			start: number;
			end: number;
			status: 'CONFIRMED' | 'CANCELLED';
			paymentStatus: 'NONE' | 'PENDING' | 'PAID';
			customerName?: string;
			customerEmail?: string;
			customerPhone?: string;
		}) => Promise<void>;
		update: (
			id: BookingId,
			updates: Partial<{ status: 'CONFIRMED' | 'CANCELLED' }>,
		) => Promise<void>;
	};
};

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
		capacity?: number;
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
	expireHolds: (now: number) => Promise<HoldExpiredEvent[]>;
	releaseHold: (params: {
		holdId: HoldId;
		sessionId: SessionId;
	}) => Promise<
		{ success: true; event: HoldReleasedEvent } | { success: false }
	>;
	releaseHoldsForSession: (sessionId: SessionId) => Promise<HoldExpiredEvent[]>;
	getState: (
		tenantId: TenantId,
		resourceId: ResourceId,
	) => Promise<InventoryState>;
};

export const createInventory = (dbStateManager: DbStateManager): Inventory => {
	const withLock = createMutex();

	const holdManager = createHoldManager({
		getState: dbStateManager.getState,
		getHoldById: dbStateManager.getHoldById,
		getHoldsBySession: dbStateManager.getHoldsBySession,
		holdRepository: dbStateManager.holdRepository,
		withLock,
	});

	const bookingManager = createBookingManager({
		getState: dbStateManager.getState,
		getHoldById: dbStateManager.getHoldById,
		holdRepository: dbStateManager.holdRepository,
		bookingRepository: dbStateManager.bookingRepository,
		withLock,
	});

	const expiryManager = createExpiryManager({
		getHoldsBySession: dbStateManager.getHoldsBySession,
		holdRepository: dbStateManager.holdRepository,
	});

	return {
		getState: dbStateManager.getState,
		placeHold: holdManager.placeHold,
		confirmBooking: bookingManager.confirmBooking,
		cancelBooking: bookingManager.cancelBooking,
		expireHolds: expiryManager.expireHolds,
		releaseHold: holdManager.releaseHold,
		releaseHoldsForSession: holdManager.releaseHoldsForSession,
	};
};
