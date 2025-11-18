import type { HoldExpiredEvent } from '../../domain/events';
import type { HoldId, ResourceId, TenantId } from '../../domain/ids';
import { setBitRange } from '../../infrastructure/bitmap';
import { createHoldExpiredEvent } from '../event-factory';
import type { AllocatorState, HoldMetadata } from './types';

export type ReleaseManager = {
	releaseHold: (params: {
		holdId: HoldId;
		tenantId: TenantId;
		resourceId: ResourceId;
	}) => Promise<HoldExpiredEvent | null>;
};

export const createReleaseManager = (params: {
	getState: (tenantId: TenantId, resourceId: ResourceId) => AllocatorState;
	holds: Map<HoldId, HoldMetadata>;
}): ReleaseManager => {
	return {
		releaseHold: async ({ holdId, tenantId, resourceId }) => {
			const hold = params.holds.get(holdId);
			if (!hold) {
				return null;
			}

			if (hold.tenantId !== tenantId || hold.resourceId !== resourceId) {
				return null;
			}

			const dayMap = params.getState(tenantId, resourceId);
			const dayState = dayMap.get(hold.day);
			if (dayState) {
				setBitRange(dayState.held, hold.start, hold.end, false);
			}

			params.holds.delete(holdId);

			return createHoldExpiredEvent({
				tenantId,
				resourceId,
				holdId,
			});
		},
	};
};
