import type { ResourceId, TenantId } from '../../domain/ids';
import type { AllocatorState } from './types';
export type StateManager = {
	getState: (tenantId: TenantId, resourceId: ResourceId) => AllocatorState;
};
export declare const createStateManager: () => {
	state: Map<string, AllocatorState>;
	manager: StateManager;
};
//# sourceMappingURL=state-manager.d.ts.map
