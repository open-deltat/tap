import { z } from 'zod';

const ULID_REGEX = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

export const ULIDSchema = z
	.string()
	.length(26)
	.regex(ULID_REGEX, 'Invalid ULID format');
export type ULID = z.infer<typeof ULIDSchema>;

// Branded Types
export type TenantId = string & { __brand: 'TenantId' };
export type ResourceId = string & { __brand: 'ResourceId' };
export type BookingId = string & { __brand: 'BookingId' };
export type HoldId = string & { __brand: 'HoldId' };
export type SessionId = string & { __brand: 'SessionId' };
export type EventId = string & { __brand: 'EventId' };
export type SlotId = string & { __brand: 'SlotId' };

// Zod Schemas for Branded Types
// These schemas validate the format (where applicable) and cast to the branded type
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

export type DayKey = string;
export type Minute = number;

export type IsoDateTimeString = string;
export type Cursor = string;
export type CurrencyCode = string;

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
	tenantId: TenantId,
	resourceId: ResourceId,
): string {
	return `availability:${tenantId}:${resourceId}`;
}
