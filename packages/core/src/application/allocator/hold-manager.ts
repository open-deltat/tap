import { ulid } from 'ulid';
import type {
	HoldExpiredEvent,
	HoldPlacedEvent,
	HoldReleasedEvent,
} from '../../domain/events';
import type {
	DayKey,
	HoldId,
	Minute,
	ResourceId,
	SessionId,
	TenantId,
} from '../../domain/ids';
import {
	createBitmapDay,
	isRangeFree,
	setBitRange,
} from '../../infrastructure/bitmap';
import {
	createHoldExpiredEvent,
	createHoldPlacedEvent,
	createHoldReleasedEvent,
} from '../event-factory';
import type { AllocatorState, HoldMetadata } from './types';

export type HoldManager = {
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
	releaseHold: (params: {
		holdId: HoldId;
		sessionId: SessionId;
	}) => Promise<
		{ success: true; event: HoldReleasedEvent } | { success: false }
	>;
	releaseHoldsForSession: (sessionId: SessionId) => Promise<HoldExpiredEvent[]>;
};

export const createHoldManager = (params: {
	getState: (tenantId: TenantId, resourceId: ResourceId) => AllocatorState;
	holds: Map<HoldId, HoldMetadata>;
	withLock: (key: string) => Promise<() => void>;
}): HoldManager => {
	return {
		placeHold: async ({
			tenantId,
			resourceId,
			sessionId,
			day,
			startMinute,
			endMinute,
			expiresAt,
			clientRef,
		}) => {
			const lockKey = `${tenantId}:${resourceId}:${day}`;
			const release = await params.withLock(lockKey);
			try {
				const dayMap = params.getState(tenantId, resourceId);
				let dayState = dayMap.get(day);
				if (!dayState) {
					dayState = createBitmapDay(15);
					dayMap.set(day, dayState);
				}

				if (
					!isRangeFree(dayState.booked, dayState.held, startMinute, endMinute)
				) {
					return { success: false };
				}

				setBitRange(dayState.held, startMinute, endMinute, true);

				const holdId = ulid() as HoldId;
				params.holds.set(holdId, {
					tenantId,
					resourceId,
					sessionId,
					day,
					start: startMinute,
					end: endMinute,
					expiresAt,
				});

				const eventParams: Parameters<typeof createHoldPlacedEvent>[0] = {
					tenantId,
					resourceId,
					holdId,
					day,
					startMinute,
					endMinute,
					expiresAt,
				};

				if (clientRef !== undefined) {
					eventParams.clientRef = clientRef;
				}

				const event = createHoldPlacedEvent(eventParams);

				return { success: true, holdId, event };
			} finally {
				release();
			}
		},
		releaseHold: async ({ holdId, sessionId }) => {
			const hold = params.holds.get(holdId);
			if (!hold || hold.sessionId !== sessionId) {
				return { success: false };
			}

			const lockKey = `${hold.tenantId}:${hold.resourceId}:${hold.day}`;
			const release = await params.withLock(lockKey);
			try {
				// Re-check in case it changed while waiting for lock
				const currentHold = params.holds.get(holdId);
				if (!currentHold || currentHold.sessionId !== sessionId) {
					return { success: false };
				}

				const dayMap = params.getState(hold.tenantId, hold.resourceId);
				const dayState = dayMap.get(hold.day);

				if (dayState) {
					setBitRange(dayState.held, hold.start, hold.end, false);
				}

				params.holds.delete(holdId);

				const event = createHoldReleasedEvent({
					tenantId: hold.tenantId,
					resourceId: hold.resourceId,
					holdId,
					day: hold.day,
					startMinute: hold.start,
					endMinute: hold.end,
				});

				return { success: true, event };
			} finally {
				release();
			}
		},
		releaseHoldsForSession: async (sessionId) => {
			const sessionHolds: HoldId[] = [];
			for (const [id, meta] of params.holds.entries()) {
				if (meta.sessionId === sessionId) {
					sessionHolds.push(id);
				}
			}

			const events: HoldExpiredEvent[] = [];

			// Optimization: group by lockKey to avoid acquiring/releasing lock multiple times
			// but for simplicity and correctness with existing locking, we iterate.
			for (const holdId of sessionHolds) {
				const hold = params.holds.get(holdId);
				if (!hold) continue;

				const lockKey = `${hold.tenantId}:${hold.resourceId}:${hold.day}`;
				const release = await params.withLock(lockKey);
				try {
					if (!params.holds.has(holdId)) continue;

					const dayMap = params.getState(hold.tenantId, hold.resourceId);
					const dayState = dayMap.get(hold.day);
					if (dayState) {
						setBitRange(dayState.held, hold.start, hold.end, false);
					}
					params.holds.delete(holdId);

					events.push(
						createHoldExpiredEvent({
							tenantId: hold.tenantId,
							resourceId: hold.resourceId,
							holdId,
							day: hold.day,
							startMinute: hold.start,
							endMinute: hold.end,
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
