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

export const httpRoutes = {
	'/availability': {
		method: 'post' as const,
		summary: 'Query available time slots',
		description: 'Returns available slots for a resource within a time range.',
		tag: 'Availability',
		request: z.object({
			tenantId: TenantIdSchema,
			resourceId: ResourceIdSchema,
			from: IsoDateTimeSchema,
			to: IsoDateTimeSchema,
			slotDurationMs: z.number().int().positive().optional(),
		}),
		response: z.object({
			tenantId: TenantIdSchema,
			resourceId: ResourceIdSchema,
			resolutionMs: z.number().int().positive(),
			asOfEventId: CursorSchema,
			freeSlots: z.array(AvailabilitySlotSchema),
			pricing: z.array(SlotPricingSchema).optional(),
		}),
	},
	'/book': {
		method: 'post' as const,
		summary: 'Confirm a booking',
		description: 'Converts a held slot into a confirmed booking.',
		tag: 'Booking',
		request: z.object({
			tenantId: TenantIdSchema,
			resourceId: ResourceIdSchema,
			slotId: SlotIdSchema,
			customer: BookingCustomerSchema,
			clientRef: z.string().optional(),
			holdSessionId: SessionIdSchema.optional(),
			holdId: HoldIdSchema.optional(),
		}),
		response: z.object({
			bookingId: BookingIdSchema,
			tenantId: TenantIdSchema,
			resourceId: ResourceIdSchema,
			slotId: SlotIdSchema,
			start: z.number(),
			end: z.number(),
			paymentStatus: z.enum(BOOKING_STATUSES),
			clientRef: z.string().optional(),
		}),
	},
} as const;

export const AvailabilityPostRequestBodySchema =
	httpRoutes['/availability'].request;
export const AvailabilityPostResponseSchema =
	httpRoutes['/availability'].response;
export const BookPostRequestBodySchema = httpRoutes['/book'].request;
export const BookPostResponseSchema = httpRoutes['/book'].response;

export type AvailabilityPostRequestBody = z.infer<
	typeof AvailabilityPostRequestBodySchema
>;
export type AvailabilityPostResponse = z.infer<
	typeof AvailabilityPostResponseSchema
>;
export type BookPostRequestBody = z.infer<typeof BookPostRequestBodySchema>;
export type BookPostResponse = z.infer<typeof BookPostResponseSchema>;
