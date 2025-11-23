import { z } from 'zod';
import { ERROR_VALUES } from './values';

// --- IDs ---

const ULID_REGEX = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

export const ULIDSchema = z
	.string()
	.length(26)
	.regex(ULID_REGEX, 'Invalid ULID format');

export type TenantId = string & { __brand: 'TenantId' };
export type ResourceId = string & { __brand: 'ResourceId' };
export type BookingId = string & { __brand: 'BookingId' };
export type HoldId = string & { __brand: 'HoldId' };
export type SessionId = string & { __brand: 'SessionId' };
export type EventId = string & { __brand: 'EventId' };
export type SlotId = string & { __brand: 'SlotId' };

export const TenantIdSchema = ULIDSchema.transform((v) => v as TenantId);
export const ResourceIdSchema = ULIDSchema.transform((v) => v as ResourceId);
export const BookingIdSchema = ULIDSchema.transform((v) => v as BookingId);
export const HoldIdSchema = ULIDSchema.transform((v) => v as HoldId);
export const SessionIdSchema = z
	.string()
	.min(1)
	.transform((v) => v as SessionId);
export const EventIdSchema = ULIDSchema.transform((v) => v as EventId);
export const SlotIdSchema = z
	.string()
	.min(1)
	.transform((v) => v as SlotId);

// --- ID Utilities ---

export function createSlotId(start: Date, end: Date): SlotId {
	return `${start.toISOString()}_${end.toISOString()}` as SlotId;
}

export function parseSlotId(slotId: string): { start: Date; end: Date } {
	const [startStr, endStr] = slotId.split('_');
	if (!startStr || !endStr) {
		throw new Error('Invalid slot ID format');
	}
	const start = new Date(startStr);
	const end = new Date(endStr);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		throw new Error('Invalid date in slot ID');
	}
	return { start, end };
}

export function createAvailabilityTopic(
	tenantId: string,
	resourceId: string,
): string {
	return `availability:${tenantId}:${resourceId}`;
}

// --- Time ---

export type IsoDateTimeString = string;
export const IsoDateTimeSchema = z.string().datetime({ offset: true });

export type DayKey = string; // YYYY-MM-DD
export type Minute = number; // 0-1439

// --- Cursors ---

export type Cursor = string;
export const CursorSchema = z.string().min(1);

// --- Money ---

export type CurrencyCode = string;
export const CurrencyCodeSchema = z.string().length(3).toUpperCase();

export const MoneyAmountSchema = z.object({
	amountCents: z.number().int().nonnegative(),
	currency: CurrencyCodeSchema,
});
export type MoneyAmount = z.infer<typeof MoneyAmountSchema>;

// --- Common Objects ---

export const BookingCustomerSchema = z.object({
	name: z.string(),
	email: z.string().email(),
	phone: z.string().optional(),
});
export type BookingCustomer = z.infer<typeof BookingCustomerSchema>;

export const AvailabilitySlotSchema = z.object({
	slotId: SlotIdSchema,
	resourceId: ResourceIdSchema,
	tenantId: TenantIdSchema,
	start: z.number(),
	end: z.number(),
});
export type AvailabilitySlot = z.infer<typeof AvailabilitySlotSchema>;

export const SlotPricingSchema = z.object({
	slotId: SlotIdSchema,
	price: MoneyAmountSchema.optional(),
});
export type SlotPricing = z.infer<typeof SlotPricingSchema>;

// --- Errors ---

export const ErrorValueSchema = z.enum(ERROR_VALUES);
export type ErrorValue = z.infer<typeof ErrorValueSchema>;

export const APIErrorResponseSchema = z.object({
	error: z.object({
		value: ErrorValueSchema,
		httpStatus: z.number().int().min(400).max(599),
		message: z.string(),
		correlationId: z.string(),
		details: z.record(z.unknown()).optional(),
	}),
});
export type APIErrorResponse = z.infer<typeof APIErrorResponseSchema>;
