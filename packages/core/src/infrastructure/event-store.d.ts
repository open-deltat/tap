import type { LedgerEvent } from '../domain/events';
export type EventStore = {
	append: (event: LedgerEvent) => Promise<void>;
	getAll: () => Promise<LedgerEvent[]>;
	getByResource: (
		tenantId: string,
		resourceId: string,
	) => Promise<LedgerEvent[]>;
	getByTenant: (tenantId: string) => Promise<LedgerEvent[]>;
	getAfterCursor: (cursor: string, tenantId?: string) => Promise<LedgerEvent[]>;
};
export declare const createInMemoryEventStore: () => EventStore;
//# sourceMappingURL=event-store.d.ts.map
