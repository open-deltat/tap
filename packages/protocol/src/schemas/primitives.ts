import { z } from 'zod';
import { ERROR_VALUES } from './values';

const ULID_REGEX = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

export const ULIDSchema = z
	.string()
	.length(26)
	.regex(ULID_REGEX, 'Invalid ULID format');

export const TenantIdSchema = ULIDSchema.brand<'TenantId'>();
export const ResourceIdSchema = ULIDSchema.brand<'ResourceId'>();
export const BookingIdSchema = ULIDSchema.brand<'BookingId'>();
export const HoldIdSchema = ULIDSchema.brand<'HoldId'>();
export const EventIdSchema = ULIDSchema.brand<'EventId'>();
export const SessionIdSchema = z.string().min(1).brand<'SessionId'>();
export const SlotIdSchema = z.string().min(1).brand<'SlotId'>();
export const CursorSchema = z.string().min(1);
export const DayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const MinuteSchema = z.number().int().min(0).max(1439);
export const UnixTimestampSchema = z.number().int().nonnegative();
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const CurrencyCodeSchema = z.string().length(3).toUpperCase();

export type TenantId = z.infer<typeof TenantIdSchema>;
export type ResourceId = z.infer<typeof ResourceIdSchema>;
export type BookingId = z.infer<typeof BookingIdSchema>;
export type HoldId = z.infer<typeof HoldIdSchema>;
export type EventId = z.infer<typeof EventIdSchema>;
export type SessionId = z.infer<typeof SessionIdSchema>;
export type SlotId = z.infer<typeof SlotIdSchema>;
export type Cursor = string;
export type DayKey = string;
export type Minute = number;
export type UnixTimestamp = number;
export type IsoDateTimeString = string;
export type CurrencyCode = string;

export const tenantId = (value: string): TenantId =>
	TenantIdSchema.parse(value);
export const resourceId = (value: string): ResourceId =>
	ResourceIdSchema.parse(value);
export const bookingId = (value: string): BookingId =>
	BookingIdSchema.parse(value);
export const holdId = (value: string): HoldId => HoldIdSchema.parse(value);
export const eventId = (value: string): EventId => EventIdSchema.parse(value);
export const sessionId = (value: string): SessionId =>
	SessionIdSchema.parse(value);
export const slotId = (value: string): SlotId => SlotIdSchema.parse(value);

export const isTenantId = (value: string): value is TenantId =>
	TenantIdSchema.safeParse(value).success;
export const isResourceId = (value: string): value is ResourceId =>
	ResourceIdSchema.safeParse(value).success;
export const isBookingId = (value: string): value is BookingId =>
	BookingIdSchema.safeParse(value).success;
export const isHoldId = (value: string): value is HoldId =>
	HoldIdSchema.safeParse(value).success;
export const isEventId = (value: string): value is EventId =>
	EventIdSchema.safeParse(value).success;
export const isSessionId = (value: string): value is SessionId =>
	SessionIdSchema.safeParse(value).success;
export const isSlotId = (value: string): value is SlotId =>
	SlotIdSchema.safeParse(value).success;

export const createSlotId = (start: Date, end: Date): SlotId =>
	slotId(`${start.toISOString()}_${end.toISOString()}`);

export const parseSlotId = (id: SlotId): { start: Date; end: Date } => {
	const [startStr, endStr] = id.split('_');
	if (!startStr || !endStr) throw new Error('Invalid slot ID format');
	const start = new Date(startStr);
	const end = new Date(endStr);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
		throw new Error('Invalid date in slot ID');
	return { start, end };
};

export const createAvailabilityTopic = (
	tenant: TenantId,
	resource: ResourceId,
): string => `availability:${tenant}:${resource}`;

export const MoneyAmountSchema = z.object({
	amountCents: z.number().int().nonnegative(),
	currency: CurrencyCodeSchema,
});
export type MoneyAmount = z.infer<typeof MoneyAmountSchema>;

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
