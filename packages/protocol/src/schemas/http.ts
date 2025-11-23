import { z } from 'zod';
import {
	AvailabilitySlotSchema,
	BookingCustomerSchema,
	BookingIdSchema,
	CursorSchema,
	HoldIdSchema,
	IsoDateTimeSchema,
	ResourceIdSchema,
	SessionIdSchema,
	SlotIdSchema,
	SlotPricingSchema,
	TenantIdSchema,
} from './primitives';
import { BOOKING_STATUSES } from './values';

// --- POST /availability ---

export const AvailabilityPostRequestBodySchema = z.object({
	tenantId: TenantIdSchema,
	resourceId: ResourceIdSchema,
	from: IsoDateTimeSchema,
	to: IsoDateTimeSchema,
	slotDurationMs: z.number().int().positive().optional(),
});
export type AvailabilityPostRequestBody = z.infer<
	typeof AvailabilityPostRequestBodySchema
>;

export const AvailabilityPostResponseSchema = z.object({
	tenantId: TenantIdSchema,
	resourceId: ResourceIdSchema,
	resolutionMs: z.number().int().positive(),
	asOfEventId: CursorSchema,
	freeSlots: z.array(AvailabilitySlotSchema),
	pricing: z.array(SlotPricingSchema).optional(),
});
export type AvailabilityPostResponse = z.infer<
	typeof AvailabilityPostResponseSchema
>;

// --- POST /book ---

export const BookPostRequestBodySchema = z.object({
	tenantId: TenantIdSchema,
	resourceId: ResourceIdSchema,
	slotId: SlotIdSchema,
	customer: BookingCustomerSchema,
	clientRef: z.string().optional(),
	holdSessionId: SessionIdSchema.optional(),
	holdId: HoldIdSchema.optional(),
});
export type BookPostRequestBody = z.infer<typeof BookPostRequestBodySchema>;

export const BookPostResponseSchema = z.object({
	bookingId: BookingIdSchema,
	tenantId: TenantIdSchema,
	resourceId: ResourceIdSchema,
	slotId: SlotIdSchema,
	start: z.number(),
	end: z.number(),
	paymentStatus: z.enum(BOOKING_STATUSES),
	clientRef: z.string().optional(),
});
export type BookPostResponse = z.infer<typeof BookPostResponseSchema>;
