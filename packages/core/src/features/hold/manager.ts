import type {
	HoldId,
	ResourceId,
	SessionId,
	TenantId,
} from '@open-tap/protocol';
import type {
	HoldExpiredEvent,
	HoldPlacedEvent,
	HoldReleasedEvent,
} from '../../domain/events';
import { createEvent } from '../../domain/factory';
import type { Interval } from '../../infrastructure/intervals';
import { createHoldId } from '../../infrastructure/utils';
import type { InventoryState } from '../inventory-types';

export type HoldManager = {
	placeHold: (params: {
		tenantId: TenantId;
		resourceId: ResourceId;
		sessionId: SessionId;
		startUnix: number;
		endUnix: number;
		expiresAt: number;
		clientRef?: string;
		capacity?: number;
	}) => Promise<
		| { success: true; holdId: HoldId; event: HoldPlacedEvent }
		| { success: false }
	>;
	releaseHold: (params: {
		holdId: HoldId;
		sessionId: SessionId;
	}) => Promise<
		{ success: true; event: HoldReleasedEvent } | { success: false }
	>;
	releaseHoldsForSession: (sessionId: SessionId) => Promise<HoldExpiredEvent[]>;
};

export const createHoldManager = (params: {
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
	getHoldByClientRef?: (
		sessionId: SessionId,
		clientRef: string,
	) => Promise<{
		id: HoldId;
		tenantId: TenantId;
		resourceId: ResourceId;
		startUnix: number;
		endUnix: number;
		expiresAt: number;
	} | null>;
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
	};
	withLock: (key: string) => Promise<() => void>;
}): HoldManager => {
	return {
		placeHold: async ({
			tenantId,
			resourceId,
			sessionId,
			startUnix,
			endUnix,
			expiresAt,
			clientRef,
			capacity = 1,
		}) => {
			if (clientRef && params.getHoldByClientRef) {
				const existingHold = await params.getHoldByClientRef(
					sessionId,
					clientRef,
				);
				if (existingHold) {
					const event = createEvent('HoldPlaced', {
						tenantId: existingHold.tenantId,
						resourceId: existingHold.resourceId,
						holdId: existingHold.id,
						startUnix: existingHold.startUnix,
						endUnix: existingHold.endUnix,
						expiresAt: existingHold.expiresAt,
						clientRef,
					});
					return { success: true, holdId: existingHold.id, event };
				}
			}

			const lockKey = `${tenantId}:${resourceId}:inventory`;
			const release = await params.withLock(lockKey);

			try {
				const state = await params.getState(tenantId, resourceId);

				const requestedInterval: Interval = {
					start: startUnix,
					end: endUnix,
					value: capacity,
				};

				const allBusy = [...state.booked, ...state.held];
				const hasOverlap = allBusy.some(
					(busy) =>
						Math.max(busy.start, requestedInterval.start) <
						Math.min(busy.end, requestedInterval.end),
				);

				if (hasOverlap) {
					return { success: false };
				}

				const generatedHoldId = createHoldId();

				await params.holdRepository.create({
					id: generatedHoldId,
					tenantId,
					resourceId,
					sessionId,
					startUnix,
					endUnix,
					expiresAt,
					...(clientRef !== undefined && { clientRef }),
				});

				const event = createEvent('HoldPlaced', {
					tenantId,
					resourceId,
					holdId: generatedHoldId,
					startUnix,
					endUnix,
					expiresAt,
					...(clientRef !== undefined && { clientRef }),
				});

				return { success: true, holdId: generatedHoldId, event };
			} finally {
				release();
			}
		},
		releaseHold: async ({ holdId, sessionId }) => {
			const hold = await params.getHoldById(holdId);
			if (!hold || hold.sessionId !== sessionId) {
				return { success: false };
			}

			const lockKey = `${hold.tenantId}:${hold.resourceId}:inventory`;
			const release = await params.withLock(lockKey);

			try {
				const currentHold = await params.getHoldById(holdId);
				if (!currentHold || currentHold.sessionId !== sessionId) {
					return { success: false };
				}

				await params.holdRepository.delete(holdId);

				const event = createEvent('HoldReleased', {
					tenantId: hold.tenantId,
					resourceId: hold.resourceId,
					holdId,
					startUnix: hold.startUnix,
					endUnix: hold.endUnix,
				});

				return { success: true, event };
			} finally {
				release();
			}
		},
		releaseHoldsForSession: async (sessionId) => {
			const sessionHolds = await params.getHoldsBySession(sessionId);

			const events: HoldExpiredEvent[] = [];

			for (const hold of sessionHolds) {
				const lockKey = `${hold.tenantId}:${hold.resourceId}:inventory`;
				const release = await params.withLock(lockKey);

				try {
					const currentHold = await params.getHoldById(hold.holdId);
					if (!currentHold || currentHold.sessionId !== sessionId) {
						continue;
					}

					await params.holdRepository.delete(hold.holdId);

					events.push(
						createEvent('HoldExpired', {
							tenantId: hold.tenantId,
							resourceId: hold.resourceId,
							holdId: hold.holdId,
							startUnix: hold.startUnix,
							endUnix: hold.endUnix,
						}),
					);
				} finally {
					release();
				}
			}
			return events;
		},
	};
};
