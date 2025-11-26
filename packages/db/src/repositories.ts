import type { Booking, Hold, Offer, Resource, Tenant } from '@tap/core';
import type { BookingId, HoldId, ResourceId, TenantId } from '@tap/protocol';
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
	create: (booking: Omit<Booking, 'createdAt'>) => Promise<void>;
	update: (id: string, updates: Partial<Booking>) => Promise<void>;
};

export type HoldRepository = {
	getById: (id: string) => Promise<Hold | null>;
	getBySessionId: (sessionId: string) => Promise<Hold[]>;
	getExpired: (now: number) => Promise<
		Array<{
			id: HoldId;
			tenantId: TenantId;
			resourceId: ResourceId;
			startUnix: number;
			endUnix: number;
			expiresAt: number;
		}>
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
				id: row.id as TenantId, // Use cast if ID is branded in Tenant type, assuming Tenant uses TenantId for id too?
				// Check TenantSchema in models.ts: id: ULIDSchema.transform((v) => v as TenantId). YES.
				name: row.name,
				slug: row.slug,
			} as Tenant;
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
				id: row.id as TenantId,
				name: row.name,
				slug: row.slug,
			} as Tenant;
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
				id: row.resource.id as ResourceId, // ResourceSchema has id as ResourceId
				tenantId: row.tenantId as TenantId,
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
				id: row.id as ResourceId,
				tenantId: row.tenantId as TenantId,
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
				id: row.id as ResourceId,
				tenantId: row.tenantId as TenantId,
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
				id: row.id as Offer['id'], // Offer.id is string (ULIDSchema)
				tenantId: row.tenantId as TenantId,
				resourceId: row.resourceId as ResourceId,
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
				id: row.id as BookingId, // Booking.id is string in models.ts, but lets see.
				// BookingSchema id: ULIDSchema (string). But in events/types it might be BookingId.
				// Let's assume string is fine or cast to BookingId if needed.
				// Wait, BookingId type from protocol is branded?
				// BookingIdSchema = ULIDSchema.brand('BookingId').
				// BookingSchema uses `id: ULIDSchema`. NO BRAND in models.ts for id?
				// Let's check models.ts again.
				// `id: ULIDSchema`.
				// So it is `string`.
				tenantId: row.tenantId as TenantId,
				resourceId: row.resourceId as ResourceId,
				holdId: (row.holdId ?? undefined) as HoldId | undefined,
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
				id: row.id as BookingId,
				tenantId: row.tenantId as TenantId,
				resourceId: row.resourceId as ResourceId,
				holdId: (row.holdId ?? undefined) as HoldId | undefined,
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
				id: row.id as HoldId, // HoldSchema id: ULIDSchema.
				// Wait, HoldSchema is like BookingSchema?
				// `id: ULIDSchema` in models.ts.
				tenantId: row.tenantId as TenantId,
				resourceId: row.resourceId as ResourceId,
				startUnix: row.startUnix,
				endUnix: row.endUnix,
				expiresAt: row.expiresAt,
				clientRef: row.clientRef ?? undefined,
				createdAt: row.createdAt.getTime(),
			};
		},
		getBySessionId: async (sessionId: string) => {
			const rows = await db
				.select()
				.from(holds)
				.where(eq(holds.sessionId, sessionId));
			return rows.map((row) => ({
				id: row.id as HoldId,
				tenantId: row.tenantId as TenantId,
				resourceId: row.resourceId as ResourceId,
				startUnix: row.startUnix,
				endUnix: row.endUnix,
				expiresAt: row.expiresAt,
				clientRef: row.clientRef ?? undefined,
				createdAt: row.createdAt.getTime(),
			}));
		},
		getExpired: async (now: number) => {
			const rows = await db
				.select()
				.from(holds)
				.where(lte(holds.expiresAt, now));
			return rows.map((row) => ({
				id: row.id as HoldId,
				tenantId: row.tenantId as TenantId,
				resourceId: row.resourceId as ResourceId,
				startUnix: row.startUnix,
				endUnix: row.endUnix,
				expiresAt: row.expiresAt,
			}));
		},
		create: async (hold: {
			id: HoldId;
			tenantId: TenantId;
			resourceId: ResourceId;
			sessionId: SessionId;
			startUnix: number;
			endUnix: number;
			expiresAt: number;
			clientRef?: string;
		}) => {
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
		delete: async (id: string) => {
			await db.delete(holds).where(eq(holds.id, id));
		},
	};
};
