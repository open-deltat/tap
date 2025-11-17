import type { Booking, Hold, Offer, Resource, Tenant } from '@tap/core';
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
	getBySlug: (slug: string) => Promise<Tenant | null>;
	getById: (id: string) => Promise<Tenant | null>;
	create: (tenant: Tenant) => Promise<void>;
};

export type ResourceRepository = {
	getBySlug: (
		tenantSlug: string,
		resourceSlug: string,
	) => Promise<(Resource & { tenantId: string }) | null>;
	getById: (id: string) => Promise<Resource | null>;
	getByTenantId: (tenantId: string) => Promise<Resource[]>;
	create: (resource: Resource) => Promise<void>;
};

export type OfferRepository = {
	getByResourceId: (resourceId: string) => Promise<Offer[]>;
	create: (offer: Offer) => Promise<void>;
};

export type BookingRepository = {
	getById: (id: string) => Promise<Booking | null>;
	getByResourceId: (
		resourceId: string,
		from?: number,
		to?: number,
	) => Promise<Booking[]>;
	create: (booking: Booking) => Promise<void>;
	update: (id: string, updates: Partial<Booking>) => Promise<void>;
};

export type HoldRepository = {
	getById: (id: string) => Promise<Hold | null>;
	getExpired: (now: number) => Promise<Hold[]>;
	create: (hold: Hold) => Promise<void>;
	delete: (id: string) => Promise<void>;
};

export const createTenantRepository = (db: Database): TenantRepository => {
	return {
		getBySlug: async (slug: string) => {
			const rows = await db
				.select()
				.from(tenants)
				.where(eq(tenants.slug, slug))
				.limit(1);
			const row = rows[0];
			if (!row) return null;
			return {
				id: row.id,
				name: row.name,
				slug: row.slug,
			};
		},
		getById: async (id: string) => {
			const rows = await db
				.select()
				.from(tenants)
				.where(eq(tenants.id, id))
				.limit(1);
			const row = rows[0];
			if (!row) return null;
			return {
				id: row.id,
				name: row.name,
				slug: row.slug,
			};
		},
		create: async (tenant: Tenant) => {
			await db.insert(tenants).values({
				id: tenant.id,
				name: tenant.name,
				slug: tenant.slug,
			});
		},
	};
};

export const createResourceRepository = (db: Database): ResourceRepository => {
	return {
		getBySlug: async (tenantSlug: string, resourceSlug: string) => {
			const rows = await db
				.select({
					resource: resources,
					tenantId: tenants.id,
				})
				.from(resources)
				.innerJoin(tenants, eq(resources.tenantId, tenants.id))
				.where(
					and(eq(tenants.slug, tenantSlug), eq(resources.slug, resourceSlug)),
				)
				.limit(1);
			const row = rows[0];
			if (!row) return null;
			return {
				id: row.resource.id,
				tenantId: row.tenantId,
				name: row.resource.name,
				slug: row.resource.slug,
				timezone: row.resource.timezone,
				slotMinutes: row.resource.slotMinutes as Resource['slotMinutes'],
				horizonDays: row.resource.horizonDays,
				requiresPayment: row.resource.requiresPayment,
				metadata: row.resource.metadata
					? (row.resource.metadata as Record<string, unknown>)
					: undefined,
			};
		},
		getById: async (id: string) => {
			const rows = await db
				.select()
				.from(resources)
				.where(eq(resources.id, id))
				.limit(1);
			const row = rows[0];
			if (!row) return null;
			return {
				id: row.id,
				tenantId: row.tenantId,
				name: row.name,
				slug: row.slug,
				timezone: row.timezone,
				slotMinutes: row.slotMinutes as Resource['slotMinutes'],
				horizonDays: row.horizonDays,
				requiresPayment: row.requiresPayment,
				metadata: row.metadata
					? (row.metadata as Record<string, unknown>)
					: undefined,
			};
		},
		getByTenantId: async (tenantId: string) => {
			const rows = await db
				.select()
				.from(resources)
				.where(eq(resources.tenantId, tenantId));
			return rows.map((row) => ({
				id: row.id,
				tenantId: row.tenantId,
				name: row.name,
				slug: row.slug,
				timezone: row.timezone,
				slotMinutes: row.slotMinutes as Resource['slotMinutes'],
				horizonDays: row.horizonDays,
				requiresPayment: row.requiresPayment,
				metadata: row.metadata
					? (row.metadata as Record<string, unknown>)
					: undefined,
			}));
		},
		create: async (resource: Resource) => {
			await db.insert(resources).values({
				id: resource.id,
				tenantId: resource.tenantId,
				name: resource.name,
				slug: resource.slug,
				timezone: resource.timezone,
				slotMinutes: resource.slotMinutes,
				horizonDays: resource.horizonDays,
				requiresPayment: resource.requiresPayment,
				metadata: resource.metadata ? resource.metadata : null,
			});
		},
	};
};

export const createOfferRepository = (db: Database): OfferRepository => {
	return {
		getByResourceId: async (resourceId: string) => {
			const rows = await db
				.select()
				.from(offers)
				.where(eq(offers.resourceId, resourceId));
			return rows.map((row) => ({
				id: row.id,
				tenantId: row.tenantId,
				resourceId: row.resourceId,
				daysOfWeek: row.daysOfWeek as number[],
				startTime: row.startTime,
				endTime: row.endTime,
				priceCents: row.priceCents ?? undefined,
				currency: row.currency,
			}));
		},
		create: async (offer: Offer) => {
			await db.insert(offers).values({
				id: offer.id,
				tenantId: offer.tenantId,
				resourceId: offer.resourceId,
				daysOfWeek: offer.daysOfWeek,
				startTime: offer.startTime,
				endTime: offer.endTime,
				priceCents: offer.priceCents ?? null,
				currency: offer.currency,
			});
		},
	};
};

export const createBookingRepository = (db: Database): BookingRepository => {
	return {
		getById: async (id: string) => {
			const rows = await db
				.select()
				.from(bookings)
				.where(eq(bookings.id, id))
				.limit(1);
			const row = rows[0];
			if (!row) return null;
			return {
				id: row.id,
				tenantId: row.tenantId,
				resourceId: row.resourceId,
				holdId: row.holdId ?? undefined,
				start: row.start,
				end: row.end,
				status: row.status as Booking['status'],
				paymentStatus: row.paymentStatus as Booking['paymentStatus'],
				paymentProvider: row.paymentProvider ?? undefined,
				paymentRef: row.paymentRef ?? undefined,
				customerName: row.customerName ?? undefined,
				customerEmail: row.customerEmail ?? undefined,
				customerPhone: row.customerPhone ?? undefined,
				externalRef: row.externalRef ?? undefined,
				createdAt: row.createdAt.getTime(),
			};
		},
		getByResourceId: async (resourceId: string, from?: number, to?: number) => {
			const conditions = [eq(bookings.resourceId, resourceId)];
			if (from !== undefined) {
				conditions.push(gte(bookings.start, from));
			}
			if (to !== undefined) {
				conditions.push(lte(bookings.end, to));
			}
			const rows = await db
				.select()
				.from(bookings)
				.where(and(...conditions));
			return rows.map((row) => ({
				id: row.id,
				tenantId: row.tenantId,
				resourceId: row.resourceId,
				holdId: row.holdId ?? undefined,
				start: row.start,
				end: row.end,
				status: row.status as Booking['status'],
				paymentStatus: row.paymentStatus as Booking['paymentStatus'],
				paymentProvider: row.paymentProvider ?? undefined,
				paymentRef: row.paymentRef ?? undefined,
				customerName: row.customerName ?? undefined,
				customerEmail: row.customerEmail ?? undefined,
				customerPhone: row.customerPhone ?? undefined,
				externalRef: row.externalRef ?? undefined,
				createdAt: row.createdAt.getTime(),
			}));
		},
		create: async (booking: Booking) => {
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
		update: async (id: string, updates: Partial<Booking>) => {
			await db
				.update(bookings)
				.set({
					...(updates.status && { status: updates.status }),
					...(updates.paymentStatus && {
						paymentStatus: updates.paymentStatus,
					}),
					...(updates.paymentProvider !== undefined && {
						paymentProvider: updates.paymentProvider ?? null,
					}),
					...(updates.paymentRef !== undefined && {
						paymentRef: updates.paymentRef ?? null,
					}),
				})
				.where(eq(bookings.id, id));
		},
	};
};

export const createHoldRepository = (db: Database): HoldRepository => {
	return {
		getById: async (id: string) => {
			const rows = await db
				.select()
				.from(holds)
				.where(eq(holds.id, id))
				.limit(1);
			const row = rows[0];
			if (!row) return null;
			return {
				id: row.id,
				tenantId: row.tenantId,
				resourceId: row.resourceId,
				day: row.day,
				startMinute: row.startMinute,
				endMinute: row.endMinute,
				expiresAt: row.expiresAt,
				clientRef: row.clientRef ?? undefined,
				createdAt: row.createdAt.getTime(),
			};
		},
		getExpired: async (now: number) => {
			const rows = await db
				.select()
				.from(holds)
				.where(lte(holds.expiresAt, now));
			return rows.map((row) => ({
				id: row.id,
				tenantId: row.tenantId,
				resourceId: row.resourceId,
				day: row.day,
				startMinute: row.startMinute,
				endMinute: row.endMinute,
				expiresAt: row.expiresAt,
				clientRef: row.clientRef ?? undefined,
				createdAt: row.createdAt.getTime(),
			}));
		},
		create: async (hold: Hold) => {
			await db.insert(holds).values({
				id: hold.id,
				tenantId: hold.tenantId,
				resourceId: hold.resourceId,
				day: hold.day,
				startMinute: hold.startMinute,
				endMinute: hold.endMinute,
				expiresAt: hold.expiresAt,
				clientRef: hold.clientRef ?? null,
			});
		},
		delete: async (id: string) => {
			await db.delete(holds).where(eq(holds.id, id));
		},
	};
};
