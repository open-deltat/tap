import { sql } from 'drizzle-orm';
import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const ledgerEvents = pgTable('ledger_events', {
	eventId: text('event_id').primaryKey(),
	tenantId: text('tenant_id').notNull(),
	resourceId: text('resource_id').notNull(),
	type: text('type').notNull(),
	version: integer('version').notNull(),
	payload: jsonb('payload').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.default(sql`now()`),
});
