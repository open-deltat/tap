import { z } from 'zod';

const ULID_REGEX = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

export const ULIDSchema = z
	.string()
	.length(26)
	.regex(ULID_REGEX, 'Invalid ULID format');
export type ULID = z.infer<typeof ULIDSchema>;

export type TenantId = ULID & { __brand: 'TenantId' };
export type ResourceId = ULID & { __brand: 'ResourceId' };
export type BookingId = ULID & { __brand: 'BookingId' };
export type HoldId = ULID & { __brand: 'HoldId' };
export type SessionId = string & { __brand: 'SessionId' }; // Session IDs are not necessarily ULIDs (e.g. might be socket IDs)
export type EventId = ULID & { __brand: 'EventId' };

export type DayKey = string;
export type Minute = number;
