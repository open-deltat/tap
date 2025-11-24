import type { HoldId, ResourceId, SessionId, TenantId } from '@tap/protocol';
import { ulid } from 'ulid';
import type {
	HoldExpiredEvent,
	HoldPlacedEvent,
	HoldReleasedEvent,
} from '../../domain/events';
import { createEvent } from '../../domain/factory';
import type { Interval } from '../../infrastructure/intervals';
import type { HoldMetadata, InventoryState } from '../inventory-types';

export type HoldManager = {
	placeHold: (params: {
		tenantId: TenantId;
		resourceId: ResourceId;
		sessionId: SessionId;
		timezone: string;
		startUnix: number;
		endUnix: number;
		expiresAt: number;
		clientRef?: string;
		capacity?: number;
	}) => Promise<
		| { success: true; holdId: HoldId; event: HoldPlacedEvent }
		| { success: false }
	>;
	releaseHold: (params: {
		holdId: HoldId;
		sessionId: SessionId;
	}) => Promise<
		{ success: true; event: HoldReleasedEvent } | { success: false }
	>;
	releaseHoldsForSession: (sessionId: SessionId) => Promise<HoldExpiredEvent[]>;
};

export const createHoldManager = (params: {
	getState: (tenantId: TenantId, resourceId: ResourceId) => InventoryState;
	holds: Map<HoldId, HoldMetadata>;
	withLock: (key: string) => Promise<() => void>;
}): HoldManager => {
	return {
		placeHold: async ({
			tenantId,
			resourceId,
			sessionId,
			timezone,
			startUnix,
			endUnix,
			expiresAt,
			clientRef,
			capacity = 1,
		}) => {
			const lockKey = `${tenantId}:${resourceId}:inventory`;
			const release = await params.withLock(lockKey);

			try {
				const state = params.getState(tenantId, resourceId);

				// In the interval model, we don't check if it's available here against "slots".
				// We assume availability is checked by reading the "Available Timeline" before calling this.
				// OR, we enforce capacity here.
				// Enforcing capacity means:
				// 1. Calculate current consumption for the requested interval.
				// 2. If consumption + requested > max_capacity, fail.
				// But "max_capacity" comes from Offers (provision). We don't have access to Offers here easily unless passed in.
				// The previous Bitmap model checked `isRangeAvailable` which implicitly knew capacity limits?
				// Ah, the previous model passed `capacity` to `isRangeAvailable` which checked if `booked + held + requested <= limit`.
				// Wait, `isRangeAvailable` took `capacity` as the LIMIT.
				// So yes, we need to know the limit.
				// The `capacity` param here is "how much we want to hold".
				// Where is the RESOURCE LIMIT?
				// In the bitmap model, `isRangeAvailable` checked if `booked + held + requested <= capacity (limit)`.
				// But `capacity` was passed from `DEFAULT_OFFER` in `availability-calculator`.
				// `placeHold` in `inventory.ts` (old) was calling `isRangeAvailable` with `capacity` passed in params.
				// The API `handleBook` calls `placeHold` but doesn't seem to pass resource capacity. It defaults to 1.
				// This implies we are currently limited to Capacity=1 unless we fetch Resource/Offer metadata.

				// For V1 Interval Refactor: Assume strict capacity=1 enforcement if we want to mimic previous logic.
				// BUT, `placeHold` is often optimistic.
				// Let's enforce overlap check.
				// If any existing interval overlaps with requested, and (existing.value + requested.value > 1), fail.

				const requestedInterval: Interval = {
					start: startUnix,
					end: endUnix,
					value: capacity,
				};

				// Check collisions
				// This is "Collision Detection"
				// For Capacity=1, any overlap with booked or held is a failure.
				const allBusy = [...state.booked, ...state.held];
				const hasOverlap = allBusy.some(
					(busy) =>
						Math.max(busy.start, requestedInterval.start) <
						Math.min(busy.end, requestedInterval.end),
				);

				if (hasOverlap) {
					return { success: false };
				}

				// Apply Hold
				state.held.push(requestedInterval);
				// Optional: Merge held intervals?
				// If we merge, we lose individual hold tracking for expiration.
				// So we keep them distinct in the list for now, or we use metadata.
				// The `inventory-types` defines `held: Interval[]`.
				// We can just append.

				const holdId = ulid() as HoldId;
				params.holds.set(holdId, {
					tenantId,
					resourceId,
					sessionId,
					timezone,
					startUnix,
					endUnix,
					expiresAt,
				});

				const event = createEvent('HoldPlaced', {
					tenantId,
					resourceId,
					holdId,
					startUnix,
					endUnix,
					expiresAt,
					...(clientRef !== undefined && { clientRef }),
				}) as HoldPlacedEvent;

				return { success: true, holdId, event };
			} finally {
				release();
			}
		},
		releaseHold: async ({ holdId, sessionId }) => {
			const hold = params.holds.get(holdId);
			if (!hold || hold.sessionId !== sessionId) {
				return { success: false };
			}

			const lockKey = `${hold.tenantId}:${hold.resourceId}:inventory`;
			const release = await params.withLock(lockKey);

			try {
				// Re-check existence
				const currentHold = params.holds.get(holdId);
				if (!currentHold || currentHold.sessionId !== sessionId) {
					return { success: false };
				}

				const state = params.getState(hold.tenantId, hold.resourceId);

				const _holdInterval: Interval = {
					start: hold.startUnix,
					end: hold.endUnix,
					value: 1,
				};

				// Remove from Held
				const _newHeld: Interval[] = [];
				// We want to remove ONE instance of this interval.
				// Since we append new intervals on hold, we can just remove the matching one?
				// BUT, if we have identical holds (same start/end), we need to be careful.
				// We don't store holdId in Interval yet.
				// Ideally we should.
				// For now, let's subtract the range.
				// CAUTION: Subtracting range removes capacity from ALL overlapping intervals in the simplistic subtract implementation.
				// If we have 2 stacks of holds, and we subtract 1, we should be left with 1.
				// Our `subtractInterval` function splits intervals. It doesn't handle "Depth".
				//
				// Correct approach for "List of Intervals":
				// Find the interval in the list that matches.
				// Since we just `push`ed it, it should be there.
				// But we might have merged them if we added optimization.
				// I removed the merge optimization in `placeHold` above to allow this.
				//
				// So, iterate and remove the first exact match.
				const index = state.held.findIndex(
					(i) => i.start === hold.startUnix && i.end === hold.endUnix,
				);
				if (index !== -1) {
					state.held.splice(index, 1);
				} else {
					// Fallback: If not found exact match (maybe resized?), subtract.
					// This is risky.
					// Let's assume exact match for V1 since we don't merge held.
				}

				params.holds.delete(holdId);

				const event = createEvent('HoldReleased', {
					tenantId: hold.tenantId,
					resourceId: hold.resourceId,
					holdId,
					startUnix: hold.startUnix,
					endUnix: hold.endUnix,
				}) as HoldReleasedEvent;

				return { success: true, event };
			} finally {
				release();
			}
		},
		releaseHoldsForSession: async (sessionId) => {
			const sessionHolds: HoldId[] = [];
			for (const [id, meta] of params.holds.entries()) {
				if (meta.sessionId === sessionId) {
					sessionHolds.push(id);
				}
			}

			const events: HoldExpiredEvent[] = [];

			// We can optimize by grouping locks, but simple loop is fine for now
			for (const holdId of sessionHolds) {
				const hold = params.holds.get(holdId);
				if (!hold) continue;

				const lockKey = `${hold.tenantId}:${hold.resourceId}:inventory`;
				const release = await params.withLock(lockKey);

				try {
					if (!params.holds.has(holdId)) continue;

					const state = params.getState(hold.tenantId, hold.resourceId);
					const index = state.held.findIndex(
						(i) => i.start === hold.startUnix && i.end === hold.endUnix,
					);
					if (index !== -1) {
						state.held.splice(index, 1);
					}

					params.holds.delete(holdId);

					events.push(
						createEvent('HoldExpired', {
							tenantId: hold.tenantId,
							resourceId: hold.resourceId,
							holdId,
							startUnix: hold.startUnix,
							endUnix: hold.endUnix,
						}) as HoldExpiredEvent,
					);
				} finally {
					release();
				}
			}
			return events;
		},
	};
};
