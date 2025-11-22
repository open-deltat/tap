import { z } from 'zod';
export declare const ULIDSchema: z.ZodString;
export type TenantId = string & {
	__brand: 'TenantId';
};
export type ResourceId = string & {
	__brand: 'ResourceId';
};
export type BookingId = string & {
	__brand: 'BookingId';
};
export type HoldId = string & {
	__brand: 'HoldId';
};
export type SessionId = string & {
	__brand: 'SessionId';
};
export type EventId = string & {
	__brand: 'EventId';
};
export type SlotId = string & {
	__brand: 'SlotId';
};
export declare const TenantIdSchema: z.ZodEffects<
	z.ZodString,
	TenantId,
	string
>;
export declare const ResourceIdSchema: z.ZodEffects<
	z.ZodString,
	ResourceId,
	string
>;
export declare const BookingIdSchema: z.ZodEffects<
	z.ZodString,
	BookingId,
	string
>;
export declare const HoldIdSchema: z.ZodEffects<z.ZodString, HoldId, string>;
export declare const SessionIdSchema: z.ZodEffects<
	z.ZodString,
	SessionId,
	string
>;
export declare const EventIdSchema: z.ZodEffects<z.ZodString, EventId, string>;
export declare const SlotIdSchema: z.ZodEffects<z.ZodString, SlotId, string>;
export declare function createSlotId(start: Date, end: Date): SlotId;
export declare function parseSlotId(slotId: string): {
	start: Date;
	end: Date;
};
export declare function createAvailabilityTopic(
	tenantId: string,
	resourceId: string,
): string;
export type IsoDateTimeString = string;
export declare const IsoDateTimeSchema: z.ZodString;
export type DayKey = string;
export type Minute = number;
export type Cursor = string;
export declare const CursorSchema: z.ZodString;
export type CurrencyCode = string;
export declare const CurrencyCodeSchema: z.ZodString;
export declare const MoneyAmountSchema: z.ZodObject<
	{
		amountCents: z.ZodNumber;
		currency: z.ZodString;
	},
	'strip',
	z.ZodTypeAny,
	{
		amountCents: number;
		currency: string;
	},
	{
		amountCents: number;
		currency: string;
	}
>;
export type MoneyAmount = z.infer<typeof MoneyAmountSchema>;
export declare const BookingCustomerSchema: z.ZodObject<
	{
		name: z.ZodString;
		email: z.ZodString;
		phone: z.ZodOptional<z.ZodString>;
	},
	'strip',
	z.ZodTypeAny,
	{
		name: string;
		email: string;
		phone?: string | undefined;
	},
	{
		name: string;
		email: string;
		phone?: string | undefined;
	}
>;
export type BookingCustomer = z.infer<typeof BookingCustomerSchema>;
export declare const AvailabilitySlotSchema: z.ZodObject<
	{
		slotId: z.ZodEffects<z.ZodString, SlotId, string>;
		resourceId: z.ZodEffects<z.ZodString, ResourceId, string>;
		tenantId: z.ZodEffects<z.ZodString, TenantId, string>;
		start: z.ZodString;
		end: z.ZodString;
	},
	'strip',
	z.ZodTypeAny,
	{
		slotId: string & {
			__brand: 'SlotId';
		};
		resourceId: string & {
			__brand: 'ResourceId';
		};
		tenantId: string & {
			__brand: 'TenantId';
		};
		start: string;
		end: string;
	},
	{
		slotId: string;
		resourceId: string;
		tenantId: string;
		start: string;
		end: string;
	}
>;
export type AvailabilitySlot = z.infer<typeof AvailabilitySlotSchema>;
export declare const SlotPricingSchema: z.ZodObject<
	{
		slotId: z.ZodEffects<z.ZodString, SlotId, string>;
		price: z.ZodOptional<
			z.ZodObject<
				{
					amountCents: z.ZodNumber;
					currency: z.ZodString;
				},
				'strip',
				z.ZodTypeAny,
				{
					amountCents: number;
					currency: string;
				},
				{
					amountCents: number;
					currency: string;
				}
			>
		>;
	},
	'strip',
	z.ZodTypeAny,
	{
		slotId: string & {
			__brand: 'SlotId';
		};
		price?:
			| {
					amountCents: number;
					currency: string;
			  }
			| undefined;
	},
	{
		slotId: string;
		price?:
			| {
					amountCents: number;
					currency: string;
			  }
			| undefined;
	}
>;
export type SlotPricing = z.infer<typeof SlotPricingSchema>;
export declare const ErrorValueSchema: z.ZodEnum<
	[
		'TAP_INVALID_INPUT',
		'TAP_RESOURCE_NOT_FOUND',
		'TAP_TENANT_NOT_FOUND',
		'TAP_SLOT_UNAVAILABLE',
		'TAP_HOLD_NOT_FOUND',
		'TAP_HOLD_EXPIRED',
		'TAP_BOOKING_NOT_FOUND',
		'TAP_UNAUTHENTICATED',
		'TAP_UNAUTHORIZED',
		'TAP_RATE_LIMIT_EXCEEDED',
		'TAP_CONCURRENCY_CONFLICT',
		'TAP_STORAGE_FAILURE',
		'TAP_INTERNAL_ERROR',
		'TAP_INVARIANT_VIOLATION',
		'TAP_QUOTA_EXCEEDED',
	]
>;
export type ErrorValue = z.infer<typeof ErrorValueSchema>;
export declare const APIErrorResponseSchema: z.ZodObject<
	{
		error: z.ZodObject<
			{
				value: z.ZodEnum<
					[
						'TAP_INVALID_INPUT',
						'TAP_RESOURCE_NOT_FOUND',
						'TAP_TENANT_NOT_FOUND',
						'TAP_SLOT_UNAVAILABLE',
						'TAP_HOLD_NOT_FOUND',
						'TAP_HOLD_EXPIRED',
						'TAP_BOOKING_NOT_FOUND',
						'TAP_UNAUTHENTICATED',
						'TAP_UNAUTHORIZED',
						'TAP_RATE_LIMIT_EXCEEDED',
						'TAP_CONCURRENCY_CONFLICT',
						'TAP_STORAGE_FAILURE',
						'TAP_INTERNAL_ERROR',
						'TAP_INVARIANT_VIOLATION',
						'TAP_QUOTA_EXCEEDED',
					]
				>;
				httpStatus: z.ZodNumber;
				message: z.ZodString;
				correlationId: z.ZodString;
				details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
			},
			'strip',
			z.ZodTypeAny,
			{
				value:
					| 'TAP_INVALID_INPUT'
					| 'TAP_RESOURCE_NOT_FOUND'
					| 'TAP_TENANT_NOT_FOUND'
					| 'TAP_SLOT_UNAVAILABLE'
					| 'TAP_HOLD_NOT_FOUND'
					| 'TAP_HOLD_EXPIRED'
					| 'TAP_BOOKING_NOT_FOUND'
					| 'TAP_UNAUTHENTICATED'
					| 'TAP_UNAUTHORIZED'
					| 'TAP_RATE_LIMIT_EXCEEDED'
					| 'TAP_CONCURRENCY_CONFLICT'
					| 'TAP_STORAGE_FAILURE'
					| 'TAP_INTERNAL_ERROR'
					| 'TAP_INVARIANT_VIOLATION'
					| 'TAP_QUOTA_EXCEEDED';
				message: string;
				httpStatus: number;
				correlationId: string;
				details?: Record<string, unknown> | undefined;
			},
			{
				value:
					| 'TAP_INVALID_INPUT'
					| 'TAP_RESOURCE_NOT_FOUND'
					| 'TAP_TENANT_NOT_FOUND'
					| 'TAP_SLOT_UNAVAILABLE'
					| 'TAP_HOLD_NOT_FOUND'
					| 'TAP_HOLD_EXPIRED'
					| 'TAP_BOOKING_NOT_FOUND'
					| 'TAP_UNAUTHENTICATED'
					| 'TAP_UNAUTHORIZED'
					| 'TAP_RATE_LIMIT_EXCEEDED'
					| 'TAP_CONCURRENCY_CONFLICT'
					| 'TAP_STORAGE_FAILURE'
					| 'TAP_INTERNAL_ERROR'
					| 'TAP_INVARIANT_VIOLATION'
					| 'TAP_QUOTA_EXCEEDED';
				message: string;
				httpStatus: number;
				correlationId: string;
				details?: Record<string, unknown> | undefined;
			}
		>;
	},
	'strip',
	z.ZodTypeAny,
	{
		error: {
			value:
				| 'TAP_INVALID_INPUT'
				| 'TAP_RESOURCE_NOT_FOUND'
				| 'TAP_TENANT_NOT_FOUND'
				| 'TAP_SLOT_UNAVAILABLE'
				| 'TAP_HOLD_NOT_FOUND'
				| 'TAP_HOLD_EXPIRED'
				| 'TAP_BOOKING_NOT_FOUND'
				| 'TAP_UNAUTHENTICATED'
				| 'TAP_UNAUTHORIZED'
				| 'TAP_RATE_LIMIT_EXCEEDED'
				| 'TAP_CONCURRENCY_CONFLICT'
				| 'TAP_STORAGE_FAILURE'
				| 'TAP_INTERNAL_ERROR'
				| 'TAP_INVARIANT_VIOLATION'
				| 'TAP_QUOTA_EXCEEDED';
			message: string;
			httpStatus: number;
			correlationId: string;
			details?: Record<string, unknown> | undefined;
		};
	},
	{
		error: {
			value:
				| 'TAP_INVALID_INPUT'
				| 'TAP_RESOURCE_NOT_FOUND'
				| 'TAP_TENANT_NOT_FOUND'
				| 'TAP_SLOT_UNAVAILABLE'
				| 'TAP_HOLD_NOT_FOUND'
				| 'TAP_HOLD_EXPIRED'
				| 'TAP_BOOKING_NOT_FOUND'
				| 'TAP_UNAUTHENTICATED'
				| 'TAP_UNAUTHORIZED'
				| 'TAP_RATE_LIMIT_EXCEEDED'
				| 'TAP_CONCURRENCY_CONFLICT'
				| 'TAP_STORAGE_FAILURE'
				| 'TAP_INTERNAL_ERROR'
				| 'TAP_INVARIANT_VIOLATION'
				| 'TAP_QUOTA_EXCEEDED';
			message: string;
			httpStatus: number;
			correlationId: string;
			details?: Record<string, unknown> | undefined;
		};
	}
>;
export type APIErrorResponse = z.infer<typeof APIErrorResponseSchema>;
//# sourceMappingURL=primitives.d.ts.map
