import {
	BookingIdSchema,
	HoldIdSchema,
	ResourceIdSchema,
	TenantIdSchema,
	ULIDSchema,
} from '@tap/protocol';
import { z } from 'zod';

export const TenantSchema = z.object({
	id: TenantIdSchema,
	name: z.string(),
	slug: z.string().min(3),
});

export const ResourceSchema = z.object({
	id: ResourceIdSchema,
	tenantId: TenantIdSchema,
	name: z.string(),
	slug: z.string().min(3),
	timezone: z.string(),
	slotMinutes: z.enum(['5', '10', '15', '30', '60']),
	horizonDays: z.number().int().default(90),
	requiresPayment: z.boolean().default(false),
	metadata: z.record(z.unknown()).optional(),
});

export const OfferSchema = z.object({
	id: ULIDSchema,
	tenantId: TenantIdSchema,
	resourceId: ResourceIdSchema,
	daysOfWeek: z.array(z.number().int().min(0).max(6)),
	startTime: z.string(),
	endTime: z.string(),
	priceCents: z.number().int().optional(),
	currency: z.string().default('USD'),
});

export const BookingSchema = z.object({
	id: BookingIdSchema,
	tenantId: TenantIdSchema,
	resourceId: ResourceIdSchema,
	holdId: HoldIdSchema.optional(),
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
	id: HoldIdSchema,
	tenantId: TenantIdSchema,
	resourceId: ResourceIdSchema,
	day: z.string(),
	startMinute: z.number().int().min(0).max(1439),
	endMinute: z.number().int().min(1).max(1440),
	expiresAt: z.number(),
	clientRef: z.string().optional(),
	createdAt: z.number().default(() => Date.now()),
});

export type Tenant = z.infer<typeof TenantSchema>;
export type Resource = z.infer<typeof ResourceSchema>;
export type Offer = z.infer<typeof OfferSchema>;
export type Booking = z.infer<typeof BookingSchema>;
export type Hold = z.infer<typeof HoldSchema>;
