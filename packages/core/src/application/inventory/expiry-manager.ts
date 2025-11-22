import type { HoldId, ResourceId, TenantId } from '@tap/protocol';
import type { HoldExpiredEvent } from '../../domain/events';
import { setBitRange } from '../../infrastructure/bitmap';
import { createHoldExpiredEvent } from '../event-factory';
import type { HoldMetadata, InventoryState } from './types';

export type ExpiryManager = {
	expireHolds: (now: number) => HoldExpiredEvent[];
};

export const createExpiryManager = (params: {
	getState: (tenantId: TenantId, resourceId: ResourceId) => InventoryState;
	holds: Map<HoldId, HoldMetadata>;
}): ExpiryManager => {
	return {
		expireHolds: (now: number) => {
			const expiredEvents: HoldExpiredEvent[] = [];
			for (const [holdId, metadata] of params.holds) {
				if (metadata.expiresAt <= now) {
					const dayMap = params.getState(
						metadata.tenantId as TenantId,
						metadata.resourceId as ResourceId,
					);
					const dayState = dayMap.get(metadata.day);
					if (dayState) {
						setBitRange(dayState.held, metadata.start, metadata.end, false);
					}
					params.holds.delete(holdId);

					expiredEvents.push(
						createHoldExpiredEvent({
							tenantId: metadata.tenantId,
							resourceId: metadata.resourceId,
							holdId,
							day: metadata.day,
							startMinute: metadata.start,
							endMinute: metadata.end,
						}),
					);
				}
			}
			return expiredEvents;
		},
	};
};
