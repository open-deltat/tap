import type { ResourceId, TenantId } from '../../domain/ids';
import type { AllocatorState } from './types';

export type StateManager = {
	getState: (tenantId: TenantId, resourceId: ResourceId) => AllocatorState;
};

export const createStateManager = (): {
	state: Map<string, AllocatorState>;
	manager: StateManager;
} => {
	const state = new Map<string, AllocatorState>();

	const getState = (
		tenantId: TenantId,
		resourceId: ResourceId,
	): AllocatorState => {
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
