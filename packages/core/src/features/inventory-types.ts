import type { ResourceId, SessionId, TenantId } from '@tap/protocol';
import type { Interval } from '../infrastructure/intervals';

// New State: A list of intervals representing capacity consumption
// We might want separate lists for 'booked' vs 'held' to allow different logic (e.g. expiration)
// Or a single list with metadata.
// Let's keep them separate for clarity and speed updates.

export type InventoryState = {
	booked: Interval[];
	held: Interval[];
};

export type HoldMetadata = {
	tenantId: TenantId;
	resourceId: ResourceId;
	sessionId: SessionId;
	timezone: string; // Still needed for Offers logic (recurrence), but not for core storage
	startUnix: number;
	endUnix: number;
	expiresAt: number;
};
