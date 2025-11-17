import type { HoldId, ResourceId, TenantId } from '../../domain/ids';
import { setBitRange } from '../../infrastructure/bitmap';
import type { AllocatorState, HoldMetadata } from './types';

export type ExpiryManager = {
	expireHolds: (now: number) => HoldId[];
};

export const createExpiryManager = (params: {
	getState: (tenantId: TenantId, resourceId: ResourceId) => AllocatorState;
	holds: Map<HoldId, HoldMetadata>;
}): ExpiryManager => {
	return {
		expireHolds: (now: number) => {
			const expired: HoldId[] = [];
			for (const [holdId, metadata] of params.holds) {
				if (metadata.expiresAt <= now) {
					expired.push(holdId);
					const dayMap = params.getState(
						metadata.tenantId as TenantId,
						metadata.resourceId as ResourceId,
					);
					const dayState = dayMap.get(metadata.day);
					if (dayState) {
						setBitRange(dayState.held, metadata.start, metadata.end, false);
					}
					params.holds.delete(holdId);
				}
			}
			return expired;
		},
	};
};
