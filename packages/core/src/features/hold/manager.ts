import type { HoldId, ResourceId, SessionId, TenantId } from '@tap/protocol';
import { ulid } from 'ulid';
import type {
	HoldExpiredEvent,
	HoldPlacedEvent,
	HoldReleasedEvent,
} from '../../domain/events';
import { createEvent } from '../../domain/factory';
import type { Interval } from '../../infrastructure/intervals';
import type { InventoryState } from '../inventory-types';

export type HoldManager = {
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
		delete: (id: string) => Promise<void>;
	};
	withLock: (key: string) => Promise<() => void>;
}): HoldManager => {
	return {
		placeHold: async ({
			tenantId,
			resourceId,
			sessionId,
			timezone: _timezone,
			startUnix,
			endUnix,
			expiresAt,
			clientRef,
			capacity = 1,
		}) => {
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

				const holdId = ulid() as HoldId;

				await params.holdRepository.create({
					id: holdId,
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
					holdId,
					startUnix,
					endUnix,
					expiresAt,
					...(clientRef !== undefined && { clientRef }),
				}) as HoldPlacedEvent;

				return { success: true, holdId, event };
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

				await params.holdRepository.delete(holdId as string);

				const event = createEvent('HoldReleased', {
					tenantId: hold.tenantId,
					resourceId: hold.resourceId,
					holdId,
					startUnix: hold.startUnix,
					endUnix: hold.endUnix,
				}) as HoldReleasedEvent;

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

					await params.holdRepository.delete(hold.holdId as string);

					events.push(
						createEvent('HoldExpired', {
							tenantId: hold.tenantId,
							resourceId: hold.resourceId,
							holdId: hold.holdId,
							startUnix: hold.startUnix,
							endUnix: hold.endUnix,
						}) as HoldExpiredEvent,
					);
				} finally {
					release();
				}
			}
			return events;
		},
	};
};
