import { type ResourceId, type TenantId, ULIDSchema } from '@tap/protocol';
import { z } from 'zod';

export const TenantSchema = z.object({
	id: ULIDSchema.transform((v) => v as TenantId),
	name: z.string(),
	slug: z.string().min(3),
});

export const ResourceSchema = z.object({
	id: ULIDSchema.transform((v) => v as ResourceId),
	tenantId: ULIDSchema.transform((v) => v as TenantId),
	name: z.string(),
	slug: z.string().min(3),
	timezone: z.string(),
	slotMinutes: z.enum(['5', '10', '15', '30', '60']),
	horizonDays: z.number().int().default(90),
	requiresPayment: z.boolean().default(false),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

const OfferBaseSchema = z.object({
	id: ULIDSchema,
	tenantId: ULIDSchema.transform((v) => v as TenantId),
	resourceId: ULIDSchema.transform((v) => v as ResourceId),
	priceCents: z.number().int().optional(),
	currency: z.string().default('USD'),
	capacity: z.number().int().min(1).default(1),
	timezone: z.string().optional(),
});

export const WeeklyOfferSchema = OfferBaseSchema.extend({
	type: z.literal('weekly'),
	daysOfWeek: z.array(z.number().int().min(0).max(6)),
	startTime: z.string(),
	endTime: z.string(),
});

export const RangeOfferSchema = OfferBaseSchema.extend({
	type: z.literal('range'),
	start: z.string(),
	end: z.string(),
});

export const OfferSchema = z.discriminatedUnion('type', [
	WeeklyOfferSchema,
	RangeOfferSchema,
]);

export const BookingSchema = z.object({
	id: ULIDSchema,
	tenantId: ULIDSchema.transform((v) => v as TenantId),
	resourceId: ULIDSchema.transform((v) => v as ResourceId),
	holdId: ULIDSchema.optional(),
	start: z.number(),
	end: z.number(),
	status: z.enum(['CONFIRMED', 'CANCELLED']).default('CONFIRMED'),
	paymentStatus: z.enum(['NONE', 'PENDING', 'PAID']).default('NONE'),
	paymentProvider: z.string().optional(),
	paymentRef: z.string().optional(),
	customerName: z.string().optional(),
	customerEmail: z.string().email().optional(),
	customerPhone: z.string().optional(),
	externalRef: z.string().optional(),
	createdAt: z.number().default(() => Date.now()),
});

export const HoldSchema = z.object({
	id: ULIDSchema,
	tenantId: ULIDSchema.transform((v) => v as TenantId),
	resourceId: ULIDSchema.transform((v) => v as ResourceId),
	startUnix: z.number(),
	endUnix: z.number(),
	expiresAt: z.number(),
	clientRef: z.string().optional(),
	createdAt: z.number().default(() => Date.now()),
});

export type Tenant = z.infer<typeof TenantSchema>;
export type Resource = z.infer<typeof ResourceSchema>;
export type Offer = z.infer<typeof OfferSchema>;
export type WeeklyOffer = z.infer<typeof WeeklyOfferSchema>;
export type RangeOffer = z.infer<typeof RangeOfferSchema>;
export type Booking = z.infer<typeof BookingSchema>;
export type Hold = z.infer<typeof HoldSchema>;
