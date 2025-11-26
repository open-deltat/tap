import type { HoldId, ResourceId, TenantId } from '@tap/protocol';
import type { HoldExpiredEvent } from '../../domain/events';
import { createEvent } from '../../domain/factory';

export type ExpiryManager = {
	expireHolds: (now: number) => Promise<HoldExpiredEvent[]>;
};

export const createExpiryManager = (params: {
	getHoldsBySession: (sessionId: string) => Promise<
		Array<{
			holdId: HoldId;
			tenantId: TenantId;
			resourceId: ResourceId;
			startUnix: number;
			endUnix: number;
			expiresAt: number;
		}>
	>;
	holdRepository: {
		getExpired: (now: number) => Promise<
			Array<{
				id: HoldId;
				tenantId: TenantId;
				resourceId: ResourceId;
				startUnix: number;
				endUnix: number;
				expiresAt: number;
			}>
		>;
		delete: (id: string) => Promise<void>;
	};
}): ExpiryManager => {
	return {
		expireHolds: async (now: number) => {
			const expiredHolds = await params.holdRepository.getExpired(now);
			const expiredEvents: HoldExpiredEvent[] = [];

			for (const hold of expiredHolds) {
				await params.holdRepository.delete(hold.id);

				expiredEvents.push(
					createEvent('HoldExpired', {
						tenantId: hold.tenantId,
						resourceId: hold.resourceId,
						holdId: hold.id,
						startUnix: hold.startUnix,
						endUnix: hold.endUnix,
					}) as HoldExpiredEvent,
				);
			}
			return expiredEvents;
		},
	};
};
