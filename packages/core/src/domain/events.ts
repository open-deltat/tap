import { z } from 'zod';
import { ULIDSchema } from './ids';
import { ResourceSchema } from './schemas';

const EventBase = z.object({
	eventId: ULIDSchema,
	tenantId: ULIDSchema,
	resourceId: ULIDSchema,
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
			holdId: ULIDSchema,
			day: z.string(),
			startMinute: z.number().int().min(0).max(1439),
			endMinute: z.number().int().min(1).max(1440),
			expiresAt: z.number(),
			clientRef: z.string().optional(),
		}),
	}),
	EventBase.extend({
		type: z.literal('HoldExpired'),
		payload: z.object({
			holdId: ULIDSchema,
		}),
	}),
	EventBase.extend({
		type: z.literal('HoldReleased'),
		payload: z.object({
			holdId: ULIDSchema,
		}),
	}),
	EventBase.extend({
		type: z.literal('BookingConfirmed'),
		payload: z.object({
			bookingId: ULIDSchema,
			holdId: ULIDSchema,
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
			bookingId: ULIDSchema,
		}),
	}),
]);

export type LedgerEvent = z.infer<typeof LedgerEventSchema>;

export type ResourceCreatedEvent = LedgerEvent & { type: 'ResourceCreated' };
export type HoldPlacedEvent = LedgerEvent & { type: 'HoldPlaced' };
export type HoldExpiredEvent = LedgerEvent & { type: 'HoldExpired' };
export type HoldReleasedEvent = LedgerEvent & { type: 'HoldReleased' };
export type BookingConfirmedEvent = LedgerEvent & { type: 'BookingConfirmed' };
export type BookingCancelledEvent = LedgerEvent & { type: 'BookingCancelled' };
