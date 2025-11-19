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
			const expiredEvents = allocator.expireHolds(now);

			if (expiredEvents.length === 0) {
				setTimeout(tick, intervalMs);
				return;
			}

			const eventStore = getEventStore();
			for (const event of expiredEvents) {
				await eventStore.append(event);
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
