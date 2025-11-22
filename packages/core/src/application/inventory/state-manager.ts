import type { ResourceId, TenantId } from '@tap/protocol';
import type { InventoryState } from './types';

export type StateManager = {
	getState: (tenantId: TenantId, resourceId: ResourceId) => InventoryState;
};

export const createStateManager = (): {
	state: Map<string, InventoryState>;
	manager: StateManager;
} => {
	const state = new Map<string, InventoryState>();

	const getState = (
		tenantId: TenantId,
		resourceId: ResourceId,
	): InventoryState => {
		const key = `${tenantId}:${resourceId}`;
		let dayMap = state.get(key);
		if (!dayMap) {
			dayMap = new Map();
			state.set(key, dayMap);
		}
		return dayMap;
	};

	return {
		state,
		manager: { getState },
	};
};
