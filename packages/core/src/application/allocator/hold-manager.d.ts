import type { HoldPlacedEvent } from '../../domain/events';
import type {
	DayKey,
	HoldId,
	Minute,
	ResourceId,
	TenantId,
} from '../../domain/ids';
import type { AllocatorState, HoldMetadata } from './types';
export type HoldManager = {
	placeHold: (params: {
		tenantId: TenantId;
		resourceId: ResourceId;
		day: DayKey;
		startMinute: Minute;
		endMinute: Minute;
		expiresAt: number;
		clientRef?: string;
	}) => Promise<
		| {
				success: true;
				holdId: HoldId;
				event: HoldPlacedEvent;
		  }
		| {
				success: false;
		  }
	>;
};
export declare const createHoldManager: (params: {
	getState: (tenantId: TenantId, resourceId: ResourceId) => AllocatorState;
	holds: Map<HoldId, HoldMetadata>;
	withLock: (key: string) => Promise<() => void>;
}) => HoldManager;
//# sourceMappingURL=hold-manager.d.ts.map
