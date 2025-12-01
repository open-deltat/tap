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
	ULIDSchema,
} from './primitives';
import { BOOKING_STATUSES } from './values';

const WeeklyOfferConfigSchema = z.object({
	daysOfWeek: z.array(z.number().int().min(0).max(6)),
	startTime: z.string().regex(/^\d{2}:\d{2}$/),
	endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

const RangeOfferConfigSchema = z.object({
	start: IsoDateTimeSchema,
	end: IsoDateTimeSchema,
});

const OfferBaseSchema = z.object({
	id: ULIDSchema.optional(),
	tenantId: TenantIdSchema,
	resourceId: ResourceIdSchema,
	timezone: z.string().optional(),
	capacity: z.number().int().min(1).default(1),
	priceCents: z.number().int().optional(),
	currency: z.string().default('USD'),
});

export const WeeklyOfferSchema = OfferBaseSchema.extend({
	type: z.literal('weekly'),
}).merge(WeeklyOfferConfigSchema);

export const RangeOfferSchema = OfferBaseSchema.extend({
	type: z.literal('range'),
}).merge(RangeOfferConfigSchema);

export const OfferSchema = z.discriminatedUnion('type', [
	WeeklyOfferSchema,
	RangeOfferSchema,
]);

export type WeeklyOfferInput = z.infer<typeof WeeklyOfferSchema>;
export type RangeOfferInput = z.infer<typeof RangeOfferSchema>;
export type OfferInput = z.infer<typeof OfferSchema>;

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
	'/offers': {
		method: 'get' as const,
		summary: 'List offers',
		description: 'Returns all offers for a resource.',
		tag: 'Offers',
		request: z.object({
			resourceId: ResourceIdSchema,
		}),
		response: z.object({
			offers: z.array(OfferSchema),
		}),
	},
	'/offers/create': {
		method: 'post' as const,
		summary: 'Create offer',
		description:
			'Creates a new offer for a resource. Weekly offers repeat on specified days. Range offers are one-time.',
		tag: 'Offers',
		request: OfferSchema,
		response: z.object({
			offer: OfferSchema,
		}),
	},
	'/offers/delete': {
		method: 'post' as const,
		summary: 'Delete offer',
		description: 'Deletes an offer by ID.',
		tag: 'Offers',
		request: z.object({
			offerId: ULIDSchema,
		}),
		response: z.object({
			deleted: z.boolean(),
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
export const OffersGetRequestSchema = httpRoutes['/offers'].request;
export const OffersGetResponseSchema = httpRoutes['/offers'].response;
export const OfferCreateRequestSchema = httpRoutes['/offers/create'].request;
export const OfferCreateResponseSchema = httpRoutes['/offers/create'].response;
export const OfferDeleteRequestSchema = httpRoutes['/offers/delete'].request;
export const OfferDeleteResponseSchema = httpRoutes['/offers/delete'].response;

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
export type OffersGetRequest = z.infer<typeof OffersGetRequestSchema>;
export type OffersGetResponse = z.infer<typeof OffersGetResponseSchema>;
export type OfferCreateRequest = z.infer<typeof OfferCreateRequestSchema>;
export type OfferCreateResponse = z.infer<typeof OfferCreateResponseSchema>;
export type OfferDeleteRequest = z.infer<typeof OfferDeleteRequestSchema>;
export type OfferDeleteResponse = z.infer<typeof OfferDeleteResponseSchema>;
