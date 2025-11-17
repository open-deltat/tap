import { z } from 'zod';
export declare const ULIDSchema: z.ZodString;
export type ULID = z.infer<typeof ULIDSchema>;
export type TenantId = ULID & {
	__brand: 'TenantId';
};
export type ResourceId = ULID & {
	__brand: 'ResourceId';
};
export type BookingId = ULID & {
	__brand: 'BookingId';
};
export type HoldId = ULID & {
	__brand: 'HoldId';
};
export type EventId = ULID & {
	__brand: 'EventId';
};
export type DayKey = string;
export type Minute = number;
//# sourceMappingURL=ids.d.ts.map
