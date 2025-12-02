import type { ResourceId, SessionId, TenantId } from '@tap/protocol';
import type { Interval } from '../infrastructure/intervals';

export type InventoryState = {
	booked: Interval[];
	held: Interval[];
};

export type HoldMetadata = {
	tenantId: TenantId;
	resourceId: ResourceId;
	sessionId: SessionId;
	startUnix: number;
	endUnix: number;
	expiresAt: number;
};
