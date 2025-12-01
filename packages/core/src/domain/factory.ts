import type { EventId, ResourceId, TenantId } from '@tap/protocol';
import { ulid } from 'ulid';
import type { LedgerEvent } from './events';

export const createEvent = <T extends LedgerEvent['type']>(
	type: T,
	params: {
		tenantId: TenantId;
		resourceId: ResourceId;
		[key: string]: unknown;
	},
): LedgerEvent => {
	const { tenantId, resourceId, ...rest } = params;
	return {
		eventId: ulid() as EventId,
		tenantId,
		resourceId,
		type,
		version: 1,
		createdAt: Date.now(),
		payload: rest,
	} as unknown as LedgerEvent;
};
