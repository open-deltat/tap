import type { HoldId, ResourceId, TenantId } from '../../domain/ids';
import type { AllocatorState, HoldMetadata } from './types';
export type ExpiryManager = {
	expireHolds: (now: number) => HoldId[];
};
export declare const createExpiryManager: (params: {
	getState: (tenantId: TenantId, resourceId: ResourceId) => AllocatorState;
	holds: Map<HoldId, HoldMetadata>;
}) => ExpiryManager;
//# sourceMappingURL=expiry-manager.d.ts.map
