import type { ResourceId, TenantId } from '@tap/core';
import { getAllocator, getEventStore } from '../services/context';

export const startHoldExpiryWorker = (
	intervalMs: number = 5000,
): (() => void) => {
	let running = true;

	const tick = async () => {
		if (!running) return;

		try {
			const now = Date.now();
			const allocator = getAllocator();
			const expiredHoldIds = allocator.expireHolds(now);

			if (expiredHoldIds.length === 0) {
				setTimeout(tick, intervalMs);
				return;
			}

			const eventStore = getEventStore();
			for (const holdId of expiredHoldIds) {
				const events = await eventStore.getAll();
				const holdEvent = events.find(
					(e) => e.type === 'HoldPlaced' && e.payload.holdId === holdId,
				);
				if (holdEvent && holdEvent.type === 'HoldPlaced') {
					const { createHoldExpiredEvent } = await import('@tap/core');
					const expiredEvent = createHoldExpiredEvent({
						tenantId: holdEvent.tenantId as TenantId,
						resourceId: holdEvent.resourceId as ResourceId,
						holdId,
					});
					await eventStore.append(expiredEvent);
				}
			}
		} catch (error) {
			console.error('Hold expiry worker error:', error);
		}

		if (running) {
			setTimeout(tick, intervalMs);
		}
	};

	tick();

	return () => {
		running = false;
	};
};
