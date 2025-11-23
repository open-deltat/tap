import type { ResourceId, TenantId } from '@tap/protocol';
import type { InventoryState } from '../inventory-types';

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
		let inventoryState = state.get(key);
		if (!inventoryState) {
			inventoryState = {
				booked: [],
				held: [],
			};
			state.set(key, inventoryState);
		}
		return inventoryState;
	};

	return {
		state,
		manager: { getState },
	};
};
