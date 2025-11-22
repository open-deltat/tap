import { z } from 'zod';
import {
	type BookingId,
	BookingIdSchema,
	type CurrencyCode,
	type Cursor,
	type HoldId,
	HoldIdSchema,
	type SessionId as HoldSessionId,
	type IsoDateTimeString,
	type ResourceId,
	ResourceIdSchema,
	SessionIdSchema,
	type SlotId,
	SlotIdSchema,
	type TenantId,
	TenantIdSchema,
} from './ids';

// Re-export common primitives
export type {
	BookingId,
	CurrencyCode,
	Cursor,
	HoldId,
	HoldSessionId,
	IsoDateTimeString,
	ResourceId,
	SlotId,
	TenantId,
};

// Common Schemas
export const availabilitySlotSchema = z.object({
	slotId: SlotIdSchema,
	resourceId: ResourceIdSchema,
	tenantId: TenantIdSchema,
	start: z.string(), // IsoDateTimeString
	end: z.string(), // IsoDateTimeString
});

export const bookingCustomerSchema = z.object({
	name: z.string(),
	email: z.string().email(),
	phone: z.string().optional(),
});

export const moneyAmountSchema = z.object({
	amountCents: z.number().int(),
	currency: z.string().length(3) as z.ZodType<CurrencyCode>,
});

export const slotPricingSchema = z.object({
	slotId: SlotIdSchema,
	price: moneyAmountSchema.optional(),
});

// API Error Response Schema
export const apiErrorResponseSchema = z.object({
	error: z.object({
		value: z.string(), // Could be refined to ErrorValue enum
		httpStatus: z.number(),
		message: z.string(),
		correlationId: z.string(),
		details: z.record(z.unknown()).optional(),
	}),
});

// POST /availability Schemas
export const availabilityPostRequestBodySchema = z.object({
	tenantId: TenantIdSchema,
	resourceId: ResourceIdSchema,
	from: z.string().datetime(),
	to: z.string().datetime(),
	slotDurationMinutes: z.number().optional(),
});

export const availabilityPostResponseSchema = z.object({
	tenantId: TenantIdSchema,
	resourceId: ResourceIdSchema,
	resolutionMinutes: z.number(),
	asOfEventId: z.string() as z.ZodType<Cursor>,
	freeSlots: z.array(availabilitySlotSchema),
	pricing: z.array(slotPricingSchema).optional(),
});

// WS /availability-ws Schemas
export const availabilityWsHelloSchema = z.object({
	type: z.literal('stream.hello'),
	resourceId: ResourceIdSchema.or(z.literal('pending')),
	tenantId: TenantIdSchema.or(z.literal('pending')),
	cursor: z.string() as z.ZodType<Cursor>,
});

export const availabilityDeltaKindSchema = z.enum([
	'HoldPlaced',
	'HoldReleased',
	'HoldExpired',
	'BookingConfirmed',
	'BookingCancelled',
]);

export const availabilityDeltaPayloadSchema = z.object({
	kind: availabilityDeltaKindSchema,
	slotId: SlotIdSchema,
	resourceId: ResourceIdSchema,
	tenantId: TenantIdSchema,
	start: z.string(),
	end: z.string(),
	holdId: HoldIdSchema.optional(),
	bookingId: BookingIdSchema.optional(),
});

export const availabilityWsDeltaSchema = z.object({
	type: z.literal('stream.delta'),
	eventId: z.string() as z.ZodType<Cursor>,
	payload: availabilityDeltaPayloadSchema,
});

export const availabilityWsErrorSchema = z.object({
	type: z.literal('stream.error'),
	errorValue: z.string(), // Validated against ErrorValue type elsewhere
	message: z.string(),
});

export const availabilityWsServerMessageSchema = z.union([
	availabilityWsHelloSchema,
	availabilityWsDeltaSchema,
	availabilityWsErrorSchema,
]);

export const availabilityWsClientMessageSchema = z.union([
	z.object({
		type: z.literal('stream.subscribe'),
		tenantId: TenantIdSchema,
		resourceId: ResourceIdSchema,
		from: z.string().optional(),
		to: z.string().optional(),
		cursor: z.string().optional() as z.ZodType<Cursor | undefined>,
	}),
	z.object({
		type: z.literal('stream.ping'),
		nonce: z.string().optional(),
	}),
]);

// POST /book Schemas
export const bookPostRequestBodySchema = z.object({
	tenantId: TenantIdSchema,
	resourceId: ResourceIdSchema,
	slotId: SlotIdSchema,
	customer: bookingCustomerSchema,
	clientRef: z.string().optional(),
	holdSessionId: SessionIdSchema.optional(),
	holdId: HoldIdSchema.optional(),
});

export const bookPostResponseSchema = z.object({
	bookingId: BookingIdSchema,
	tenantId: TenantIdSchema,
	resourceId: ResourceIdSchema,
	slotId: SlotIdSchema,
	start: z.string(),
	end: z.string(),
	paymentStatus: z.enum(['NONE', 'PENDING', 'PAID']),
	clientRef: z.string().optional(),
});

// WS /hold-ws Schemas
export const holdWsHelloSchema = z.object({
	type: z.literal('hold.session.hello'),
	sessionId: SessionIdSchema,
	tenantId: TenantIdSchema,
	resourceId: ResourceIdSchema,
	slotId: SlotIdSchema,
});

export const holdWsConfirmedSchema = z.object({
	type: z.literal('hold.confirmed'),
	holdId: HoldIdSchema,
	tenantId: TenantIdSchema,
	resourceId: ResourceIdSchema,
	slotId: SlotIdSchema,
	start: z.string(),
	end: z.string(),
});

export const holdWsForceReleaseSchema = z.object({
	type: z.literal('hold.forceRelease'),
	holdId: HoldIdSchema,
	reason: z.enum([
		'DISCONNECTED',
		'SERVER_SHUTDOWN',
		'POLICY_LIMIT',
		'RESOURCE_DISABLED',
	]),
});

export const holdWsErrorSchema = z.object({
	type: z.literal('hold.error'),
	errorValue: z.string(),
	message: z.string(),
});

export const holdWsServerMessageSchema = z.union([
	holdWsHelloSchema,
	holdWsConfirmedSchema,
	holdWsForceReleaseSchema,
	holdWsErrorSchema,
]);

export const holdWsClientMessageSchema = z.union([
	z.object({
		type: z.literal('hold.ping'),
		nonce: z.string().optional(),
	}),
	z.object({
		type: z.literal('hold.release'),
		holdId: HoldIdSchema,
	}),
]);

// Inferred Types
export type APIErrorResponse = z.infer<typeof apiErrorResponseSchema>;
export type AvailabilitySlot = z.infer<typeof availabilitySlotSchema>;
export type BookingCustomer = z.infer<typeof bookingCustomerSchema>;
export type MoneyAmount = z.infer<typeof moneyAmountSchema>;
export type SlotPricing = z.infer<typeof slotPricingSchema>;
export type AvailabilityPostRequestBody = z.infer<
	typeof availabilityPostRequestBodySchema
>;
export type AvailabilityPostResponse = z.infer<
	typeof availabilityPostResponseSchema
>;
export type AvailabilityWsHello = z.infer<typeof availabilityWsHelloSchema>;
export type AvailabilityDeltaKind = z.infer<typeof availabilityDeltaKindSchema>;
export type AvailabilityDeltaPayload = z.infer<
	typeof availabilityDeltaPayloadSchema
>;
export type AvailabilityWsDelta = z.infer<typeof availabilityWsDeltaSchema>;
export type AvailabilityWsError = z.infer<typeof availabilityWsErrorSchema>;
export type AvailabilityWsServerMessage = z.infer<
	typeof availabilityWsServerMessageSchema
>;
export type AvailabilityWsClientMessage = z.infer<
	typeof availabilityWsClientMessageSchema
>;
export type BookPostRequestBody = z.infer<typeof bookPostRequestBodySchema>;
export type BookPostResponse = z.infer<typeof bookPostResponseSchema>;
export type HoldWsHello = z.infer<typeof holdWsHelloSchema>;
export type HoldWsConfirmed = z.infer<typeof holdWsConfirmedSchema>;
export type HoldWsForceRelease = z.infer<typeof holdWsForceReleaseSchema>;
export type HoldWsError = z.infer<typeof holdWsErrorSchema>;
export type HoldWsServerMessage = z.infer<typeof holdWsServerMessageSchema>;
export type HoldWsClientMessage = z.infer<typeof holdWsClientMessageSchema>;
