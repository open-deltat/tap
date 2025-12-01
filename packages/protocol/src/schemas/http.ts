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
	'/cancel': {
		method: 'post' as const,
		summary: 'Cancel a booking',
		description: 'Cancels an existing booking and releases the slot.',
		tag: 'Booking',
		request: z.object({
			tenantId: TenantIdSchema,
			resourceId: ResourceIdSchema,
			bookingId: BookingIdSchema,
		}),
		response: z.object({
			bookingId: BookingIdSchema,
			tenantId: TenantIdSchema,
			resourceId: ResourceIdSchema,
			slotId: SlotIdSchema,
			cancelled: z.boolean(),
		}),
	},
	'/health': {
		method: 'get' as const,
		summary: 'Health check',
		description: 'Returns server health status, version, and clock info.',
		tag: 'System',
		request: z.object({}),
		response: z.object({
			status: z.enum(['ok', 'degraded']),
			version: z.string(),
			timestamp: z.number(),
		}),
	},
	'/bookings': {
		method: 'post' as const,
		summary: 'List bookings',
		description: 'Returns all bookings for a resource within a time range.',
		tag: 'Booking',
		request: z.object({
			tenantId: TenantIdSchema,
			resourceId: ResourceIdSchema,
			from: IsoDateTimeSchema.optional(),
			to: IsoDateTimeSchema.optional(),
			status: z.enum(['CONFIRMED', 'CANCELLED', 'ALL']).optional(),
		}),
		response: z.object({
			bookings: z.array(
				z.object({
					bookingId: BookingIdSchema,
					slotId: SlotIdSchema,
					start: z.number(),
					end: z.number(),
					status: z.enum(['CONFIRMED', 'CANCELLED']),
					customerName: z.string().optional(),
					customerEmail: z.string().optional(),
					createdAt: z.number(),
				}),
			),
		}),
	},
} as const;

export const AvailabilityPostRequestBodySchema =
	httpRoutes['/availability'].request;
export const AvailabilityPostResponseSchema =
	httpRoutes['/availability'].response;
export const BookPostRequestBodySchema = httpRoutes['/book'].request;
export const BookPostResponseSchema = httpRoutes['/book'].response;
export const CancelPostRequestBodySchema = httpRoutes['/cancel'].request;
export const CancelPostResponseSchema = httpRoutes['/cancel'].response;
export const HealthResponseSchema = httpRoutes['/health'].response;
export const BookingsPostRequestBodySchema = httpRoutes['/bookings'].request;
export const BookingsPostResponseSchema = httpRoutes['/bookings'].response;

export type AvailabilityPostRequestBody = z.infer<
	typeof AvailabilityPostRequestBodySchema
>;
export type AvailabilityPostResponse = z.infer<
	typeof AvailabilityPostResponseSchema
>;
export type BookPostRequestBody = z.infer<typeof BookPostRequestBodySchema>;
export type BookPostResponse = z.infer<typeof BookPostResponseSchema>;
export type CancelPostRequestBody = z.infer<typeof CancelPostRequestBodySchema>;
export type CancelPostResponse = z.infer<typeof CancelPostResponseSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type BookingsPostRequestBody = z.infer<
	typeof BookingsPostRequestBodySchema
>;
export type BookingsPostResponse = z.infer<typeof BookingsPostResponseSchema>;
