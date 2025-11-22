import { expect, test } from 'bun:test';
import { ulid } from 'ulid';
import type { ResourceId, TenantId } from '../../domain/ids';
import { createStateManager } from './state-manager';

test('getState returns same map for same tenant/resource', () => {
	const { manager } = createStateManager();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const state1 = manager.getState(tenantId, resourceId);
	const state2 = manager.getState(tenantId, resourceId);

	expect(state1).toBe(state2);
});

test('getState returns different maps for different resources', () => {
	const { manager } = createStateManager();
	const tenantId = ulid() as TenantId;
	const resourceId1 = ulid() as ResourceId;
	const resourceId2 = ulid() as ResourceId;

	const state1 = manager.getState(tenantId, resourceId1);
	const state2 = manager.getState(tenantId, resourceId2);

	expect(state1).not.toBe(state2);
});

test('getState returns different maps for different tenants', () => {
	const { manager } = createStateManager();
	const tenantId1 = ulid() as TenantId;
	const tenantId2 = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const state1 = manager.getState(tenantId1, resourceId);
	const state2 = manager.getState(tenantId2, resourceId);

	expect(state1).not.toBe(state2);
});

test('getState creates empty map for new tenant/resource', () => {
	const { manager } = createStateManager();
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;

	const state = manager.getState(tenantId, resourceId);

	expect(state.size).toBe(0);
});
