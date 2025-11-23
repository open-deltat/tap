import type { HoldId, ResourceId, TenantId } from '@tap/protocol';
import type { HoldExpiredEvent } from '../../domain/events';
import { createEvent } from '../../domain/factory';
import type { HoldMetadata, InventoryState } from '../inventory-types';

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
					const state = params.getState(
						metadata.tenantId as TenantId,
						metadata.resourceId as ResourceId,
					);

					// Remove from Held
					// Exact match removal
					const index = state.held.findIndex(
						(i) => i.start === metadata.startUnix && i.end === metadata.endUnix,
					);
					if (index !== -1) {
						state.held.splice(index, 1);
					}

					params.holds.delete(holdId);

					expiredEvents.push(
						createEvent('HoldExpired', {
							tenantId: metadata.tenantId,
							resourceId: metadata.resourceId,
							holdId,
							startUnix: metadata.startUnix,
							endUnix: metadata.endUnix,
						}) as HoldExpiredEvent,
					);
				}
			}
			return expiredEvents;
		},
	};
};
