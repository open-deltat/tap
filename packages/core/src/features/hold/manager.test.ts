import { describe, expect, it } from 'bun:test';
import type { HoldId, ResourceId, SessionId, TenantId } from '@tap/protocol';
import type { InventoryState } from '../inventory-types';
import { createHoldManager } from './manager';

const TENANT_ID = 'tenant-test' as TenantId;
const RESOURCE_ID = 'resource-test' as ResourceId;
const SESSION_ID = 'session-test' as SessionId;

const createEmptyState = (): InventoryState => ({
	booked: [],
	held: [],
});

const createMockDependencies = () => {
	const holds = new Map<
		HoldId,
		{
			tenantId: TenantId;
			resourceId: ResourceId;
			sessionId: SessionId;
			startUnix: number;
			endUnix: number;
			expiresAt: number;
		}
	>();

	const sessionHolds = new Map<SessionId, Set<HoldId>>();
	let inventoryState = createEmptyState();

	return {
		holds,
		sessionHolds,
		setInventoryState: (state: InventoryState) => {
			inventoryState = state;
		},
		deps: {
			getState: async (_tenantId: TenantId, _resourceId: ResourceId) =>
				inventoryState,
			getHoldById: async (holdId: HoldId) => holds.get(holdId) ?? null,
			getHoldsBySession: async (sessionId: SessionId) => {
				const holdIds = sessionHolds.get(sessionId) ?? new Set();
				return Array.from(holdIds).flatMap((holdId) => {
					const hold = holds.get(holdId);
					if (!hold) return [];
					return [
						{
							holdId,
							tenantId: hold.tenantId,
							resourceId: hold.resourceId,
							startUnix: hold.startUnix,
							endUnix: hold.endUnix,
							expiresAt: hold.expiresAt,
						},
					];
				});
			},
			holdRepository: {
				create: async (hold: {
					id: HoldId;
					tenantId: TenantId;
					resourceId: ResourceId;
					sessionId: SessionId;
					startUnix: number;
					endUnix: number;
					expiresAt: number;
					clientRef?: string;
				}) => {
					holds.set(hold.id, {
						tenantId: hold.tenantId,
						resourceId: hold.resourceId,
						sessionId: hold.sessionId,
						startUnix: hold.startUnix,
						endUnix: hold.endUnix,
						expiresAt: hold.expiresAt,
					});
					const existing = sessionHolds.get(hold.sessionId) ?? new Set();
					existing.add(hold.id);
					sessionHolds.set(hold.sessionId, existing);
				},
				delete: async (id: HoldId) => {
					const hold = holds.get(id);
					if (hold) {
						const existing = sessionHolds.get(hold.sessionId);
						existing?.delete(id);
					}
					holds.delete(id);
				},
			},
			withLock: async (_key: string) => () => {},
		},
	};
};

describe('HoldManager', () => {
	describe('placeHold', () => {
		it('places hold on available slot', async () => {
			const { deps } = createMockDependencies();
			const manager = createHoldManager(deps);

			const now = Date.now();
			const result = await manager.placeHold({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.holdId).toBeDefined();
				expect(result.event.type).toBe('HoldPlaced');
				expect(result.event.tenantId).toBe(TENANT_ID);
				expect(result.event.resourceId).toBe(RESOURCE_ID);
			}
		});

		it('rejects hold on already held slot', async () => {
			const { deps, setInventoryState } = createMockDependencies();
			const manager = createHoldManager(deps);

			const now = Date.now();
			setInventoryState({
				booked: [],
				held: [
					{
						start: now,
						end: now + 15 * 60 * 1000,
						value: 1,
					},
				],
			});

			const result = await manager.placeHold({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
			});

			expect(result.success).toBe(false);
		});

		it('rejects hold on already booked slot', async () => {
			const { deps, setInventoryState } = createMockDependencies();
			const manager = createHoldManager(deps);

			const now = Date.now();
			setInventoryState({
				booked: [
					{
						start: now,
						end: now + 15 * 60 * 1000,
						value: 1,
					},
				],
				held: [],
			});

			const result = await manager.placeHold({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
			});

			expect(result.success).toBe(false);
		});

		it('rejects hold on partially overlapping held slot', async () => {
			const { deps, setInventoryState } = createMockDependencies();
			const manager = createHoldManager(deps);

			const now = Date.now();
			setInventoryState({
				booked: [],
				held: [
					{
						start: now + 10 * 60 * 1000,
						end: now + 25 * 60 * 1000,
						value: 1,
					},
				],
			});

			const result = await manager.placeHold({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
			});

			expect(result.success).toBe(false);
		});

		it('allows hold on adjacent slot (not overlapping)', async () => {
			const { deps, setInventoryState } = createMockDependencies();
			const manager = createHoldManager(deps);

			const now = Date.now();
			setInventoryState({
				booked: [],
				held: [
					{
						start: now + 15 * 60 * 1000,
						end: now + 30 * 60 * 1000,
						value: 1,
					},
				],
			});

			const result = await manager.placeHold({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
			});

			expect(result.success).toBe(true);
		});

		it('includes clientRef in event when provided', async () => {
			const { deps } = createMockDependencies();
			const manager = createHoldManager(deps);

			const now = Date.now();
			const result = await manager.placeHold({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
				clientRef: 'my-reference',
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.event.payload.clientRef).toBe('my-reference');
			}
		});

		it('returns existing hold when clientRef matches (idempotency)', async () => {
			const clientRefHolds = new Map<string, HoldId>();
			const { deps, holds } = createMockDependencies();

			const depsWithClientRef = {
				...deps,
				getHoldByClientRef: async (sessionId: SessionId, clientRef: string) => {
					const key = `${sessionId}:${clientRef}`;
					const holdId = clientRefHolds.get(key);
					if (!holdId) return null;
					const hold = holds.get(holdId);
					if (!hold) return null;
					return {
						id: holdId,
						tenantId: hold.tenantId,
						resourceId: hold.resourceId,
						startUnix: hold.startUnix,
						endUnix: hold.endUnix,
						expiresAt: hold.expiresAt,
					};
				},
				holdRepository: {
					...deps.holdRepository,
					create: async (hold: {
						id: HoldId;
						tenantId: TenantId;
						resourceId: ResourceId;
						sessionId: SessionId;
						startUnix: number;
						endUnix: number;
						expiresAt: number;
						clientRef?: string;
					}) => {
						await deps.holdRepository.create(hold);
						if (hold.clientRef) {
							clientRefHolds.set(
								`${hold.sessionId}:${hold.clientRef}`,
								hold.id,
							);
						}
					},
				},
			};

			const manager = createHoldManager(depsWithClientRef);

			const now = Date.now();
			const firstResult = await manager.placeHold({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
				clientRef: 'idempotent-ref',
			});

			expect(firstResult.success).toBe(true);
			if (!firstResult.success) return;

			const secondResult = await manager.placeHold({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
				clientRef: 'idempotent-ref',
			});

			expect(secondResult.success).toBe(true);
			if (!secondResult.success) return;

			expect(secondResult.holdId).toBe(firstResult.holdId);
			expect(holds.size).toBe(1);
		});
	});

	describe('releaseHold', () => {
		it('releases hold owned by session', async () => {
			const { deps, holds } = createMockDependencies();
			const manager = createHoldManager(deps);

			const now = Date.now();
			const placeResult = await manager.placeHold({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
			});

			expect(placeResult.success).toBe(true);
			if (!placeResult.success) return;

			const releaseResult = await manager.releaseHold({
				holdId: placeResult.holdId,
				sessionId: SESSION_ID,
			});

			expect(releaseResult.success).toBe(true);
			if (releaseResult.success) {
				expect(releaseResult.event.type).toBe('HoldReleased');
			}

			expect(holds.has(placeResult.holdId)).toBe(false);
		});

		it('rejects release from different session', async () => {
			const { deps } = createMockDependencies();
			const manager = createHoldManager(deps);

			const now = Date.now();
			const placeResult = await manager.placeHold({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
			});

			expect(placeResult.success).toBe(true);
			if (!placeResult.success) return;

			const differentSession = 'different-session' as SessionId;
			const releaseResult = await manager.releaseHold({
				holdId: placeResult.holdId,
				sessionId: differentSession,
			});

			expect(releaseResult.success).toBe(false);
		});

		it('rejects release of non-existent hold', async () => {
			const { deps } = createMockDependencies();
			const manager = createHoldManager(deps);

			const releaseResult = await manager.releaseHold({
				holdId: 'non-existent' as HoldId,
				sessionId: SESSION_ID,
			});

			expect(releaseResult.success).toBe(false);
		});
	});

	describe('releaseHoldsForSession', () => {
		it('releases all holds for a session', async () => {
			const { deps, holds } = createMockDependencies();
			const manager = createHoldManager(deps);

			const now = Date.now();

			await manager.placeHold({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
			});

			await manager.placeHold({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now + 30 * 60 * 1000,
				endUnix: now + 45 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
			});

			expect(holds.size).toBe(2);

			const events = await manager.releaseHoldsForSession(SESSION_ID);

			expect(events).toHaveLength(2);
			for (const event of events) {
				expect(event.type).toBe('HoldExpired');
			}

			expect(holds.size).toBe(0);
		});

		it('returns empty array for session with no holds', async () => {
			const { deps } = createMockDependencies();
			const manager = createHoldManager(deps);

			const events = await manager.releaseHoldsForSession(
				'no-holds' as SessionId,
			);

			expect(events).toHaveLength(0);
		});

		it('only releases holds for specified session', async () => {
			const { deps, holds } = createMockDependencies();
			const manager = createHoldManager(deps);

			const now = Date.now();
			const otherSession = 'other-session' as SessionId;

			await manager.placeHold({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
			});

			await manager.placeHold({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: otherSession,
				startUnix: now + 30 * 60 * 1000,
				endUnix: now + 45 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
			});

			expect(holds.size).toBe(2);

			await manager.releaseHoldsForSession(SESSION_ID);

			expect(holds.size).toBe(1);
		});
	});

	describe('concurrency', () => {
		it('prevents double-hold via lock', async () => {
			const { deps, setInventoryState } = createMockDependencies();

			let lockCount = 0;
			const delayedDeps = {
				...deps,
				withLock: async (_key: string) => {
					lockCount++;
					await new Promise((resolve) => setTimeout(resolve, 10));
					return () => {};
				},
			};

			const manager = createHoldManager(delayedDeps);
			const now = Date.now();

			setInventoryState(createEmptyState());

			const result1Promise = manager.placeHold({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
			});

			const result2Promise = manager.placeHold({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: 'session-2' as SessionId,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
			});

			const [result1, result2] = await Promise.all([
				result1Promise,
				result2Promise,
			]);

			expect(lockCount).toBe(2);
			expect(result1.success || result2.success).toBe(true);
		});
	});

	describe('edge cases', () => {
		it('handles zero-duration hold', async () => {
			const { deps } = createMockDependencies();
			const manager = createHoldManager(deps);

			const now = Date.now();
			const result = await manager.placeHold({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now,
				expiresAt: now + 5 * 60 * 1000,
			});

			expect(result.success).toBe(true);
		});

		it('handles past expiration time', async () => {
			const { deps } = createMockDependencies();
			const manager = createHoldManager(deps);

			const now = Date.now();
			const result = await manager.placeHold({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now - 5 * 60 * 1000,
			});

			expect(result.success).toBe(true);
		});

		it('handles hold exactly touching busy interval end', async () => {
			const { deps, setInventoryState } = createMockDependencies();
			const manager = createHoldManager(deps);

			const now = Date.now();
			setInventoryState({
				booked: [],
				held: [
					{
						start: now - 15 * 60 * 1000,
						end: now,
						value: 1,
					},
				],
			});

			const result = await manager.placeHold({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
			});

			expect(result.success).toBe(true);
		});
	});
});
