import type { EventStore, LedgerEvent } from '@tap/core';
import { and, asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ledgerEvents } from './schema';

const rowToEvent = (row: {
	eventId: string;
	tenantId: string;
	resourceId: string;
	type: string;
	version: number;
	payload: unknown;
	createdAt: Date;
}): LedgerEvent => {
	return {
		eventId: row.eventId,
		tenantId: row.tenantId,
		resourceId: row.resourceId,
		type: row.type as LedgerEvent['type'],
		version: row.version,
		payload: row.payload as LedgerEvent['payload'],
		createdAt: row.createdAt.getTime(),
	} as LedgerEvent;
};

export const createPostgresEventStore = (
	connectionString: string,
): EventStore => {
	const client = postgres(connectionString);
	const db = drizzle(client, { schema: { ledgerEvents } });

	return {
		append: async (event: LedgerEvent) => {
			await db.insert(ledgerEvents).values({
				eventId: event.eventId,
				tenantId: event.tenantId,
				resourceId: event.resourceId,
				type: event.type,
				version: event.version,
				payload: event.payload,
				createdAt: new Date(event.createdAt),
			});
		},

		getAll: async (): Promise<LedgerEvent[]> => {
			const rows = await db
				.select()
				.from(ledgerEvents)
				.orderBy(asc(ledgerEvents.createdAt));
			return rows.map(rowToEvent);
		},

		getByResource: async (
			tenantId: string,
			resourceId: string,
		): Promise<LedgerEvent[]> => {
			const rows = await db
				.select()
				.from(ledgerEvents)
				.where(
					and(
						eq(ledgerEvents.tenantId, tenantId),
						eq(ledgerEvents.resourceId, resourceId),
					),
				)
				.orderBy(asc(ledgerEvents.createdAt));
			return rows.map(rowToEvent);
		},

		getByTenant: async (tenantId: string): Promise<LedgerEvent[]> => {
			const rows = await db
				.select()
				.from(ledgerEvents)
				.where(eq(ledgerEvents.tenantId, tenantId))
				.orderBy(asc(ledgerEvents.createdAt));
			return rows.map(rowToEvent);
		},
	};
};
