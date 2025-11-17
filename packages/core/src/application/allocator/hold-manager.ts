import { ulid } from 'ulid';
import type { HoldPlacedEvent } from '../../domain/events';
import type {
	DayKey,
	HoldId,
	Minute,
	ResourceId,
	TenantId,
} from '../../domain/ids';
import {
	createBitmapDay,
	isRangeFree,
	setBitRange,
} from '../../infrastructure/bitmap';
import { createHoldPlacedEvent } from '../event-factory';
import type { AllocatorState, HoldMetadata } from './types';

export type HoldManager = {
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
	};
};
