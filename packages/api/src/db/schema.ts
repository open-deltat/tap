import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const tenants = sqliteTable('tenants', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	slug: text('slug').notNull().unique(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
});

export const resources = sqliteTable('resources', {
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
	requiresPayment: integer('requires_payment', { mode: 'boolean' })
		.notNull()
		.default(false),
	disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
	metadata: text('metadata', { mode: 'json' }),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
});

export type OfferConfig =
	| { daysOfWeek: number[]; startTime: string; endTime: string }
	| { start: string; end: string };

export const offers = sqliteTable('offers', {
	id: text('id').primaryKey(),
	tenantId: text('tenant_id')
		.notNull()
		.references(() => tenants.id),
	resourceId: text('resource_id')
		.notNull()
		.references(() => resources.id),
	type: text('type').notNull().$type<'weekly' | 'range'>(),
	config: text('config', { mode: 'json' }).notNull().$type<OfferConfig>(),
	timezone: text('timezone'),
	priceCents: integer('price_cents'),
	currency: text('currency').notNull().default('USD'),
	bufferBeforeMinutes: integer('buffer_before_minutes').notNull().default(0),
	bufferAfterMinutes: integer('buffer_after_minutes').notNull().default(0),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
});

export const bookings = sqliteTable('bookings', {
	id: text('id').primaryKey(),
	tenantId: text('tenant_id')
		.notNull()
		.references(() => tenants.id),
	resourceId: text('resource_id')
		.notNull()
		.references(() => resources.id),
	holdId: text('hold_id'),
	start: integer('start', { mode: 'number' }).notNull(),
	end: integer('end', { mode: 'number' }).notNull(),
	status: text('status').notNull().default('CONFIRMED'),
	paymentStatus: text('payment_status').notNull().default('NONE'),
	paymentProvider: text('payment_provider'),
	paymentRef: text('payment_ref'),
	customerName: text('customer_name'),
	customerEmail: text('customer_email'),
	customerPhone: text('customer_phone'),
	externalRef: text('external_ref'),
	clientRef: text('client_ref'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
});

export const holds = sqliteTable('holds', {
	id: text('id').primaryKey(),
	tenantId: text('tenant_id')
		.notNull()
		.references(() => tenants.id),
	resourceId: text('resource_id')
		.notNull()
		.references(() => resources.id),
	sessionId: text('session_id').notNull(),
	startUnix: integer('start_unix', { mode: 'number' }).notNull(),
	endUnix: integer('end_unix', { mode: 'number' }).notNull(),
	expiresAt: integer('expires_at', { mode: 'number' }).notNull(),
	clientRef: text('client_ref'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
});

export const apiKeys = sqliteTable('api_keys', {
	id: text('id').primaryKey(),
	tenantId: text('tenant_id')
		.notNull()
		.references(() => tenants.id),
	name: text('name').notNull(),
	keyHash: text('key_hash').notNull(),
	keyPrefix: text('key_prefix').notNull(),
	scopes: text('scopes', { mode: 'json' }).notNull().$type<string[]>(),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
	lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
});
