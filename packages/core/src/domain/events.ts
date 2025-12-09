import {
	BookingIdSchema,
	HoldIdSchema,
	ResourceIdSchema,
	TenantIdSchema,
	ULIDSchema,
} from '@open-tap/protocol';
import { z } from 'zod';
import { ResourceSchema } from './models';

const EventBase = z.object({
	eventId: ULIDSchema,
	tenantId: TenantIdSchema,
	resourceId: ResourceIdSchema,
	version: z.literal(1),
	createdAt: z.number(),
});

export const LedgerEventSchema = z.discriminatedUnion('type', [
	EventBase.extend({
		type: z.literal('ResourceCreated'),
		payload: z.object({
			resource: ResourceSchema.pick({
				id: true,
				name: true,
				slug: true,
				timezone: true,
				slotMinutes: true,
			}),
		}),
	}),
	EventBase.extend({
		type: z.literal('HoldPlaced'),
		payload: z.object({
			holdId: HoldIdSchema,
			startUnix: z.number(),
			endUnix: z.number(),
			expiresAt: z.number(),
			clientRef: z.string().optional(),
		}),
	}),
	EventBase.extend({
		type: z.literal('HoldExpired'),
		payload: z.object({
			holdId: HoldIdSchema,
			startUnix: z.number().optional(),
			endUnix: z.number().optional(),
		}),
	}),
	EventBase.extend({
		type: z.literal('HoldReleased'),
		payload: z.object({
			holdId: HoldIdSchema,
			startUnix: z.number().optional(),
			endUnix: z.number().optional(),
		}),
	}),
	EventBase.extend({
		type: z.literal('BookingConfirmed'),
		payload: z.object({
			bookingId: BookingIdSchema,
			holdId: HoldIdSchema,
			start: z.number(),
			end: z.number(),
			customerName: z.string().optional(),
			customerEmail: z.string().email().optional(),
			customerPhone: z.string().optional(),
			paymentStatus: z.enum(['NONE', 'PENDING', 'PAID']).optional(),
			priceCents: z.number().int().optional(),
		}),
	}),
	EventBase.extend({
		type: z.literal('BookingCancelled'),
		payload: z.object({
			bookingId: BookingIdSchema,
			start: z.number().optional(),
			end: z.number().optional(),
		}),
	}),
]);

export type LedgerEvent = z.infer<typeof LedgerEventSchema>;

export type ResourceCreatedEvent = Extract<
	LedgerEvent,
	{ type: 'ResourceCreated' }
>;
export type HoldPlacedEvent = Extract<LedgerEvent, { type: 'HoldPlaced' }>;
export type HoldExpiredEvent = Extract<LedgerEvent, { type: 'HoldExpired' }>;
export type HoldReleasedEvent = Extract<LedgerEvent, { type: 'HoldReleased' }>;
export type BookingConfirmedEvent = Extract<
	LedgerEvent,
	{ type: 'BookingConfirmed' }
>;
export type BookingCancelledEvent = Extract<
	LedgerEvent,
	{ type: 'BookingCancelled' }
>;

export type LedgerEventType = LedgerEvent['type'];
