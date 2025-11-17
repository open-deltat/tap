import type {
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
		bookingId: BookingId;
		customerEmail?: string;
		priceCents?: number;
	}) => Promise<BookingConfirmedEvent | null>;
	expireHolds: (now: number) => HoldId[];
	getState: (tenantId: TenantId, resourceId: ResourceId) => AllocatorState;
};

export const createAllocator = (): Allocator => {
	const { state, manager } = createStateManager();
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
		expireHolds: expiryManager.expireHolds,
	};
};
