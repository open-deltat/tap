import { sql } from 'drizzle-orm';
import {
	bigint,
	boolean,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
} from 'drizzle-orm/pg-core';

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

export const tenants = pgTable('tenants', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	slug: text('slug').notNull().unique(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.default(sql`now()`),
});

export const resources = pgTable('resources', {
	id: text('id').primaryKey(),
	tenantId: text('tenant_id')
		.notNull()
		.references(() => tenants.id),
	parentId: text('parent_id'),
	name: text('name').notNull(),
	slug: text('slug').notNull(),
	timezone: text('timezone').notNull(),
	slotMinutes: text('slot_minutes').notNull(),
	horizonDays: integer('horizon_days').notNull().default(90),
	requiresPayment: boolean('requires_payment').notNull().default(false),
	disabled: boolean('disabled').notNull().default(false),
	metadata: jsonb('metadata'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.default(sql`now()`),
});

export type OfferConfig =
	| { daysOfWeek: number[]; startTime: string; endTime: string }
	| { start: string; end: string };

export const offers = pgTable('offers', {
	id: text('id').primaryKey(),
	tenantId: text('tenant_id')
		.notNull()
		.references(() => tenants.id),
	resourceId: text('resource_id')
		.notNull()
		.references(() => resources.id),
	type: text('type').notNull().$type<'weekly' | 'range'>(),
	config: jsonb('config').notNull().$type<OfferConfig>(),
	timezone: text('timezone'),
	priceCents: integer('price_cents'),
	currency: text('currency').notNull().default('USD'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.default(sql`now()`),
});

export const bookings = pgTable('bookings', {
	id: text('id').primaryKey(),
	tenantId: text('tenant_id')
		.notNull()
		.references(() => tenants.id),
	resourceId: text('resource_id')
		.notNull()
		.references(() => resources.id),
	holdId: text('hold_id'),
	start: bigint('start', { mode: 'number' }).notNull(),
	end: bigint('end', { mode: 'number' }).notNull(),
	status: text('status').notNull().default('CONFIRMED'),
	paymentStatus: text('payment_status').notNull().default('NONE'),
	paymentProvider: text('payment_provider'),
	paymentRef: text('payment_ref'),
	customerName: text('customer_name'),
	customerEmail: text('customer_email'),
	customerPhone: text('customer_phone'),
	externalRef: text('external_ref'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.default(sql`now()`),
});

export const holds = pgTable('holds', {
	id: text('id').primaryKey(),
	tenantId: text('tenant_id')
		.notNull()
		.references(() => tenants.id),
	resourceId: text('resource_id')
		.notNull()
		.references(() => resources.id),
	sessionId: text('session_id').notNull(),
	startUnix: bigint('start_unix', { mode: 'number' }).notNull(),
	endUnix: bigint('end_unix', { mode: 'number' }).notNull(),
	expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
	clientRef: text('client_ref'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.default(sql`now()`),
});
