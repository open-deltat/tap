import type { EventId, ResourceId, TenantId } from '@tap/protocol';
import { ulid } from 'ulid';
import type { LedgerEvent } from './events';

// Simplified factory that is less generic-heavy to appease TS
export function createEvent<T extends LedgerEvent['type']>(
	type: T,
	params: {
		tenantId: TenantId;
		resourceId: ResourceId;
		[key: string]: any;
	},
): LedgerEvent {
	const { tenantId, resourceId, ...rest } = params;
	// Cast to any to bypass strict discriminated union checks during construction
	// The callers are strongly typed via the specific event type casts they perform
	return {
		eventId: ulid() as EventId,
		tenantId,
		resourceId,
		type,
		version: 1,
		createdAt: Date.now(),
		payload: rest,
	} as any as LedgerEvent;
}
