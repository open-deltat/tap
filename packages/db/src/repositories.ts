import type { Booking, Hold, Offer, Resource, Tenant } from '@tap/core';
import {
	type BookingId,
	bookingId,
	type HoldId,
	holdId,
	type ResourceId,
	resourceId,
	type SessionId,
	type TenantId,
	tenantId,
} from '@tap/protocol';
import { and, eq, gte, lte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { bookings, holds, offers, resources, tenants } from './schema';

export const createDatabase = (connectionString: string) => {
	const client = postgres(connectionString);
	return drizzle(client, {
		schema: { tenants, resources, offers, bookings, holds },
	});
};

export type Database = ReturnType<typeof createDatabase>;

export type TenantRepository = {
	readonly getBySlug: (slug: string) => Promise<Tenant | null>;
	readonly getById: (id: TenantId) => Promise<Tenant | null>;
	readonly create: (tenant: Tenant) => Promise<void>;
};

export type ResourceRepository = {
	getBySlug: (
		tenantSlug: string,
		resourceSlug: string,
	) => Promise<Resource | null>;
	getById: (id: ResourceId) => Promise<Resource | null>;
	getByTenantId: (tid: TenantId) => Promise<Resource[]>;
	create: (resource: Resource) => Promise<void>;
	getChildren: (parentId: ResourceId) => Promise<Resource[]>;
	getLeaves: (tenantId: TenantId) => Promise<Resource[]>;
};

export type OfferRepository = {
	getByResourceId: (rid: ResourceId) => Promise<readonly Offer[]>;
	create: (offer: Offer) => Promise<void>;
	delete: (id: string) => Promise<void>;
};

export type BookingRepository = {
	getById: (id: BookingId) => Promise<Booking | null>;
	getByResourceId: (
		rid: ResourceId,
		from?: number,
		to?: number,
	) => Promise<Booking[]>;
	create: (booking: Omit<Booking, 'createdAt'>) => Promise<void>;
	update: (
		id: BookingId,
		updates: Partial<
			Pick<
				Booking,
				'status' | 'paymentStatus' | 'paymentProvider' | 'paymentRef'
			>
		>,
	) => Promise<void>;
};

export type HoldRepository = {
	getById: (id: HoldId) => Promise<Hold | null>;
	getBySessionId: (sid: SessionId) => Promise<Hold[]>;
	getExpired: (now: number) => Promise<
		{
			id: HoldId;
			tenantId: TenantId;
			resourceId: ResourceId;
			startUnix: number;
			endUnix: number;
			expiresAt: number;
		}[]
	>;
	create: (hold: {
		id: HoldId;
		tenantId: TenantId;
		resourceId: ResourceId;
		sessionId: SessionId;
		startUnix: number;
		endUnix: number;
		expiresAt: number;
		clientRef?: string;
	}) => Promise<void>;
	delete: (id: HoldId) => Promise<void>;
};

const SLOT_MINUTES = ['5', '10', '15', '30', '60'] as const;
type SlotMinutes = (typeof SLOT_MINUTES)[number];

const isSlotMinutes = (value: string): value is SlotMinutes =>
	SLOT_MINUTES.includes(value as SlotMinutes);

const BOOKING_STATUS = ['CONFIRMED', 'CANCELLED'] as const;
type BookingStatus = (typeof BOOKING_STATUS)[number];

const isBookingStatus = (value: string): value is BookingStatus =>
	BOOKING_STATUS.includes(value as BookingStatus);

const PAYMENT_STATUS = ['NONE', 'PENDING', 'PAID'] as const;
type PaymentStatus = (typeof PAYMENT_STATUS)[number];

const isPaymentStatus = (value: string): value is PaymentStatus =>
	PAYMENT_STATUS.includes(value as PaymentStatus);

const toTenant = (row: typeof tenants.$inferSelect): Tenant => ({
	id: tenantId(row.id),
	name: row.name,
	slug: row.slug,
});

export const createTenantRepository = (db: Database): TenantRepository => ({
	getBySlug: async (slug) => {
		const [row] = await db
			.select()
			.from(tenants)
			.where(eq(tenants.slug, slug))
			.limit(1);
		return row ? toTenant(row) : null;
	},
	getById: async (id) => {
		const [row] = await db
			.select()
			.from(tenants)
			.where(eq(tenants.id, id))
			.limit(1);
		return row ? toTenant(row) : null;
	},
	create: async (tenant) => {
		await db
			.insert(tenants)
			.values({ id: tenant.id, name: tenant.name, slug: tenant.slug });
	},
});

const toResource = (row: typeof resources.$inferSelect): Resource => {
	if (!isSlotMinutes(row.slotMinutes)) {
		throw new Error(`Invalid slotMinutes value: ${row.slotMinutes}`);
	}
	return {
		id: resourceId(row.id),
		tenantId: tenantId(row.tenantId),
		parentId: row.parentId ? resourceId(row.parentId) : null,
		name: row.name,
		slug: row.slug,
		timezone: row.timezone,
		slotMinutes: row.slotMinutes,
		horizonDays: row.horizonDays,
		requiresPayment: row.requiresPayment,
		disabled: row.disabled,
		metadata: row.metadata
			? (row.metadata as Record<string, string>)
			: undefined,
	};
};

export const createResourceRepository = (db: Database): ResourceRepository => ({
	getBySlug: async (tenantSlug, resourceSlug) => {
		const [row] = await db
			.select({ resource: resources })
			.from(resources)
			.innerJoin(tenants, eq(resources.tenantId, tenants.id))
			.where(
				and(eq(tenants.slug, tenantSlug), eq(resources.slug, resourceSlug)),
			)
			.limit(1);
		return row ? toResource(row.resource) : null;
	},
	getById: async (id) => {
		const [row] = await db
			.select()
			.from(resources)
			.where(eq(resources.id, id))
			.limit(1);
		return row ? toResource(row) : null;
	},
	getByTenantId: async (tid) => {
		const rows = await db
			.select()
			.from(resources)
			.where(eq(resources.tenantId, tid));
		return rows.map(toResource);
	},
	create: async (resource) => {
		await db.insert(resources).values({
			id: resource.id,
			tenantId: resource.tenantId,
			parentId: resource.parentId ?? null,
			name: resource.name,
			slug: resource.slug,
			timezone: resource.timezone,
			slotMinutes: resource.slotMinutes,
			horizonDays: resource.horizonDays,
			requiresPayment: resource.requiresPayment,
			disabled: resource.disabled ?? false,
			metadata: resource.metadata ?? null,
		});
	},
	getChildren: async (parentId) => {
		const rows = await db
			.select()
			.from(resources)
			.where(eq(resources.parentId, parentId));
		return rows.map(toResource);
	},
	getLeaves: async (tenantId) => {
		const allResources = await db
			.select()
			.from(resources)
			.where(eq(resources.tenantId, tenantId));
		const parentIds = new Set(
			allResources.map((r) => r.parentId).filter(Boolean),
		);
		return allResources.filter((r) => !parentIds.has(r.id)).map(toResource);
	},
});

type WeeklyConfig = {
	daysOfWeek: number[];
	startTime: string;
	endTime: string;
};
type RangeConfig = { start: string; end: string };

const isWeeklyConfig = (config: unknown): config is WeeklyConfig =>
	typeof config === 'object' &&
	config !== null &&
	'daysOfWeek' in config &&
	'startTime' in config &&
	'endTime' in config;

const isRangeConfig = (config: unknown): config is RangeConfig =>
	typeof config === 'object' &&
	config !== null &&
	'start' in config &&
	'end' in config;

const toOffer = (row: typeof offers.$inferSelect): Offer | null => {
	const base = {
		id: row.id,
		tenantId: tenantId(row.tenantId),
		resourceId: resourceId(row.resourceId),
		priceCents: row.priceCents ?? undefined,
		currency: row.currency,
		timezone: row.timezone ?? undefined,
		bufferBeforeMinutes: row.bufferBeforeMinutes,
		bufferAfterMinutes: row.bufferAfterMinutes,
	};

	if (row.type === 'weekly' && isWeeklyConfig(row.config)) {
		return {
			...base,
			type: 'weekly',
			daysOfWeek: row.config.daysOfWeek,
			startTime: row.config.startTime,
			endTime: row.config.endTime,
		};
	}

	if (row.type === 'range' && isRangeConfig(row.config)) {
		return {
			...base,
			type: 'range',
			start: row.config.start,
			end: row.config.end,
		};
	}

	return null;
};

export const createOfferRepository = (db: Database): OfferRepository => ({
	getByResourceId: async (rid) => {
		const rows = await db
			.select()
			.from(offers)
			.where(eq(offers.resourceId, rid));
		return rows.map(toOffer).filter((o): o is Offer => o !== null);
	},
	create: async (offer) => {
		const config =
			offer.type === 'weekly'
				? {
						daysOfWeek: offer.daysOfWeek,
						startTime: offer.startTime,
						endTime: offer.endTime,
					}
				: { start: offer.start, end: offer.end };

		await db.insert(offers).values({
			id: offer.id,
			tenantId: offer.tenantId,
			resourceId: offer.resourceId,
			type: offer.type,
			config,
			timezone: offer.timezone ?? null,
			priceCents: offer.priceCents ?? null,
			currency: offer.currency,
			bufferBeforeMinutes: offer.bufferBeforeMinutes ?? 0,
			bufferAfterMinutes: offer.bufferAfterMinutes ?? 0,
		});
	},
	delete: async (id) => {
		await db.delete(offers).where(eq(offers.id, id));
	},
});

const toBooking = (row: typeof bookings.$inferSelect): Booking => {
	if (!isBookingStatus(row.status)) {
		throw new Error(`Invalid booking status: ${row.status}`);
	}
	if (!isPaymentStatus(row.paymentStatus)) {
		throw new Error(`Invalid payment status: ${row.paymentStatus}`);
	}
	return {
		id: bookingId(row.id),
		tenantId: tenantId(row.tenantId),
		resourceId: resourceId(row.resourceId),
		holdId: row.holdId ? holdId(row.holdId) : undefined,
		start: row.start,
		end: row.end,
		status: row.status,
		paymentStatus: row.paymentStatus,
		paymentProvider: row.paymentProvider ?? undefined,
		paymentRef: row.paymentRef ?? undefined,
		customerName: row.customerName ?? undefined,
		customerEmail: row.customerEmail ?? undefined,
		customerPhone: row.customerPhone ?? undefined,
		externalRef: row.externalRef ?? undefined,
		createdAt: row.createdAt.getTime(),
	};
};

export const createBookingRepository = (db: Database): BookingRepository => ({
	getById: async (id) => {
		const [row] = await db
			.select()
			.from(bookings)
			.where(eq(bookings.id, id))
			.limit(1);
		return row ? toBooking(row) : null;
	},
	getByResourceId: async (rid, from, to) => {
		const conditions = [eq(bookings.resourceId, rid)];
		if (from !== undefined) conditions.push(gte(bookings.start, from));
		if (to !== undefined) conditions.push(lte(bookings.end, to));
		const rows = await db
			.select()
			.from(bookings)
			.where(and(...conditions));
		return rows.map(toBooking);
	},
	create: async (booking) => {
		await db.insert(bookings).values({
			id: booking.id,
			tenantId: booking.tenantId,
			resourceId: booking.resourceId,
			holdId: booking.holdId ?? null,
			start: booking.start,
			end: booking.end,
			status: booking.status,
			paymentStatus: booking.paymentStatus,
			paymentProvider: booking.paymentProvider ?? null,
			paymentRef: booking.paymentRef ?? null,
			customerName: booking.customerName ?? null,
			customerEmail: booking.customerEmail ?? null,
			customerPhone: booking.customerPhone ?? null,
			externalRef: booking.externalRef ?? null,
		});
	},
	update: async (id, updates) => {
		const updateSet: Partial<typeof bookings.$inferInsert> = {};
		if (updates.status !== undefined) updateSet.status = updates.status;
		if (updates.paymentStatus !== undefined)
			updateSet.paymentStatus = updates.paymentStatus;
		if (updates.paymentProvider !== undefined)
			updateSet.paymentProvider = updates.paymentProvider ?? null;
		if (updates.paymentRef !== undefined)
			updateSet.paymentRef = updates.paymentRef ?? null;
		await db.update(bookings).set(updateSet).where(eq(bookings.id, id));
	},
});

const toHold = (row: typeof holds.$inferSelect): Hold => ({
	id: holdId(row.id),
	tenantId: tenantId(row.tenantId),
	resourceId: resourceId(row.resourceId),
	startUnix: row.startUnix,
	endUnix: row.endUnix,
	expiresAt: row.expiresAt,
	clientRef: row.clientRef ?? undefined,
	createdAt: row.createdAt.getTime(),
});

const toExpiredHold = (row: typeof holds.$inferSelect) => ({
	id: holdId(row.id),
	tenantId: tenantId(row.tenantId),
	resourceId: resourceId(row.resourceId),
	startUnix: row.startUnix,
	endUnix: row.endUnix,
	expiresAt: row.expiresAt,
});

export const createHoldRepository = (db: Database): HoldRepository => ({
	getById: async (id) => {
		const [row] = await db
			.select()
			.from(holds)
			.where(eq(holds.id, id))
			.limit(1);
		return row ? toHold(row) : null;
	},
	getBySessionId: async (sid) => {
		const rows = await db.select().from(holds).where(eq(holds.sessionId, sid));
		return rows.map(toHold);
	},
	getExpired: async (now) => {
		const rows = await db.select().from(holds).where(lte(holds.expiresAt, now));
		return rows.map(toExpiredHold);
	},
	create: async (hold) => {
		await db.insert(holds).values({
			id: hold.id,
			tenantId: hold.tenantId,
			resourceId: hold.resourceId,
			sessionId: hold.sessionId,
			startUnix: hold.startUnix,
			endUnix: hold.endUnix,
			expiresAt: hold.expiresAt,
			clientRef: hold.clientRef ?? null,
		});
	},
	delete: async (id) => {
		await db.delete(holds).where(eq(holds.id, id));
	},
});
