import type { LedgerEvent } from '../domain/events';

export type EventStore = {
	append: (event: LedgerEvent) => Promise<void>;
	getAll: () => Promise<LedgerEvent[]>;
	getByResource: (
		tenantId: string,
		resourceId: string,
	) => Promise<LedgerEvent[]>;
	getByTenant: (tenantId: string) => Promise<LedgerEvent[]>;
};

export const createInMemoryEventStore = (): EventStore => {
	const events: LedgerEvent[] = [];

	return {
		append: async (event: LedgerEvent) => {
			events.push(event);
		},

		getAll: async () => {
			return [...events];
		},

		getByResource: async (tenantId: string, resourceId: string) => {
			return events.filter(
				(e) => e.tenantId === tenantId && e.resourceId === resourceId,
			);
		},

		getByTenant: async (tenantId: string) => {
			return events.filter((e) => e.tenantId === tenantId);
		},
	};
};
