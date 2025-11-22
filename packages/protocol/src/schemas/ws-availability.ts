import { z } from 'zod';
import {
	BookingIdSchema,
	CursorSchema,
	ErrorValueSchema,
	HoldIdSchema,
	IsoDateTimeSchema,
	ResourceIdSchema,
	SlotIdSchema,
	TenantIdSchema,
} from './primitives';
import { AVAILABILITY_DELTA_KINDS } from './values';

export const AvailabilityWsHelloSchema = z.object({
	type: z.literal('stream.hello'),
	resourceId: ResourceIdSchema.nullable(),
	tenantId: TenantIdSchema.nullable(),
	cursor: CursorSchema,
});
export type AvailabilityWsHello = z.infer<typeof AvailabilityWsHelloSchema>;

export const AvailabilityDeltaKindSchema = z.enum(AVAILABILITY_DELTA_KINDS);
export type AvailabilityDeltaKind = z.infer<typeof AvailabilityDeltaKindSchema>;

export const AvailabilityDeltaPayloadSchema = z.object({
	kind: AvailabilityDeltaKindSchema,
	slotId: SlotIdSchema,
	resourceId: ResourceIdSchema,
	tenantId: TenantIdSchema,
	start: IsoDateTimeSchema,
	end: IsoDateTimeSchema,
	holdId: HoldIdSchema.optional(),
	bookingId: BookingIdSchema.optional(),
});
export type AvailabilityDeltaPayload = z.infer<
	typeof AvailabilityDeltaPayloadSchema
>;

export const AvailabilityWsDeltaSchema = z.object({
	type: z.literal('stream.delta'),
	eventId: CursorSchema,
	payload: AvailabilityDeltaPayloadSchema,
});
export type AvailabilityWsDelta = z.infer<typeof AvailabilityWsDeltaSchema>;

export const AvailabilityWsErrorSchema = z.object({
	type: z.literal('stream.error'),
	errorValue: ErrorValueSchema,
	message: z.string(),
});
export type AvailabilityWsError = z.infer<typeof AvailabilityWsErrorSchema>;

export const AvailabilityWsServerMessageSchema = z.union([
	AvailabilityWsHelloSchema,
	AvailabilityWsDeltaSchema,
	AvailabilityWsErrorSchema,
]);
export type AvailabilityWsServerMessage = z.infer<
	typeof AvailabilityWsServerMessageSchema
>;

export const AvailabilityWsClientMessageSchema = z.union([
	z.object({
		type: z.literal('stream.subscribe'),
		tenantId: TenantIdSchema,
		resourceId: ResourceIdSchema,
		from: IsoDateTimeSchema.optional(),
		to: IsoDateTimeSchema.optional(),
		cursor: CursorSchema.optional(),
	}),
	z.object({
		type: z.literal('stream.ping'),
		nonce: z.string().optional(),
	}),
]);
export type AvailabilityWsClientMessage = z.infer<
	typeof AvailabilityWsClientMessageSchema
>;
