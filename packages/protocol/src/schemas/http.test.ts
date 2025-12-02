import { describe, expect, it } from 'bun:test';
import {
	AvailabilityPostRequestBodySchema,
	AvailabilityPostResponseSchema,
	BookingsPostRequestBodySchema,
	BookingsPostResponseSchema,
	BookPostRequestBodySchema,
	BookPostResponseSchema,
	CancelPostRequestBodySchema,
	CancelPostResponseSchema,
	HealthResponseSchema,
	OfferCreateRequestSchema,
	OfferDeleteRequestSchema,
	OfferSchema,
	OffersGetRequestSchema,
	OffersGetResponseSchema,
	RangeOfferSchema,
	validateRangeOffer,
	WeeklyOfferSchema,
} from './http';

const VALID_TENANT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const VALID_RESOURCE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
const VALID_BOOKING_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAX';
const VALID_SLOT_ID = '2025-01-15T09:00:00.000Z_2025-01-15T10:00:00.000Z';

describe('HTTP Schemas', () => {
	describe('AvailabilityPostRequestBodySchema', () => {
		it('accepts valid request with required fields', () => {
			const result = AvailabilityPostRequestBodySchema.safeParse({
				tenantId: VALID_TENANT_ID,
				resourceId: VALID_RESOURCE_ID,
				from: '2025-01-15T00:00:00.000Z',
				to: '2025-01-16T00:00:00.000Z',
			});
			expect(result.success).toBe(true);
		});

		it('accepts request with optional slotDurationMs', () => {
			const result = AvailabilityPostRequestBodySchema.safeParse({
				tenantId: VALID_TENANT_ID,
				resourceId: VALID_RESOURCE_ID,
				from: '2025-01-15T00:00:00.000Z',
				to: '2025-01-16T00:00:00.000Z',
				slotDurationMs: 1800000,
			});
			expect(result.success).toBe(true);
		});

		it('rejects invalid tenantId', () => {
			const result = AvailabilityPostRequestBodySchema.safeParse({
				tenantId: 'invalid',
				resourceId: VALID_RESOURCE_ID,
				from: '2025-01-15T00:00:00.000Z',
				to: '2025-01-16T00:00:00.000Z',
			});
			expect(result.success).toBe(false);
		});

		it('rejects invalid ISO datetime', () => {
			const result = AvailabilityPostRequestBodySchema.safeParse({
				tenantId: VALID_TENANT_ID,
				resourceId: VALID_RESOURCE_ID,
				from: '2025-01-15',
				to: '2025-01-16T00:00:00.000Z',
			});
			expect(result.success).toBe(false);
		});

		it('rejects negative slotDurationMs', () => {
			const result = AvailabilityPostRequestBodySchema.safeParse({
				tenantId: VALID_TENANT_ID,
				resourceId: VALID_RESOURCE_ID,
				from: '2025-01-15T00:00:00.000Z',
				to: '2025-01-16T00:00:00.000Z',
				slotDurationMs: -1,
			});
			expect(result.success).toBe(false);
		});

		it('rejects missing required fields', () => {
			const result = AvailabilityPostRequestBodySchema.safeParse({
				tenantId: VALID_TENANT_ID,
			});
			expect(result.success).toBe(false);
		});
	});

	describe('AvailabilityPostResponseSchema', () => {
		it('accepts valid response', () => {
			const result = AvailabilityPostResponseSchema.safeParse({
				tenantId: VALID_TENANT_ID,
				resourceId: VALID_RESOURCE_ID,
				resolutionMs: 900000,
				asOfEventId: 'cursor-123',
				freeSlots: [
					{
						slotId: VALID_SLOT_ID,
						resourceId: VALID_RESOURCE_ID,
						tenantId: VALID_TENANT_ID,
						start: 1704067200000,
						end: 1704070800000,
					},
				],
			});
			expect(result.success).toBe(true);
		});

		it('accepts response with empty freeSlots', () => {
			const result = AvailabilityPostResponseSchema.safeParse({
				tenantId: VALID_TENANT_ID,
				resourceId: VALID_RESOURCE_ID,
				resolutionMs: 900000,
				asOfEventId: 'cursor-123',
				freeSlots: [],
			});
			expect(result.success).toBe(true);
		});

		it('accepts response with optional pricing', () => {
			const result = AvailabilityPostResponseSchema.safeParse({
				tenantId: VALID_TENANT_ID,
				resourceId: VALID_RESOURCE_ID,
				resolutionMs: 900000,
				asOfEventId: 'cursor-123',
				freeSlots: [],
				pricing: [
					{
						slotId: VALID_SLOT_ID,
						price: { amountCents: 5000, currency: 'USD' },
					},
				],
			});
			expect(result.success).toBe(true);
		});
	});

	describe('BookPostRequestBodySchema', () => {
		it('accepts valid booking request', () => {
			const result = BookPostRequestBodySchema.safeParse({
				tenantId: VALID_TENANT_ID,
				resourceId: VALID_RESOURCE_ID,
				slotId: VALID_SLOT_ID,
				customer: {
					name: 'John Doe',
					email: 'john@example.com',
				},
			});
			expect(result.success).toBe(true);
		});

		it('accepts booking with optional holdId and sessionId', () => {
			const result = BookPostRequestBodySchema.safeParse({
				tenantId: VALID_TENANT_ID,
				resourceId: VALID_RESOURCE_ID,
				slotId: VALID_SLOT_ID,
				customer: {
					name: 'John Doe',
					email: 'john@example.com',
				},
				holdSessionId: 'session-123',
				holdId: VALID_BOOKING_ID,
				clientRef: 'my-ref',
			});
			expect(result.success).toBe(true);
		});

		it('rejects invalid customer email', () => {
			const result = BookPostRequestBodySchema.safeParse({
				tenantId: VALID_TENANT_ID,
				resourceId: VALID_RESOURCE_ID,
				slotId: VALID_SLOT_ID,
				customer: {
					name: 'John Doe',
					email: 'invalid-email',
				},
			});
			expect(result.success).toBe(false);
		});

		it('rejects missing customer', () => {
			const result = BookPostRequestBodySchema.safeParse({
				tenantId: VALID_TENANT_ID,
				resourceId: VALID_RESOURCE_ID,
				slotId: VALID_SLOT_ID,
			});
			expect(result.success).toBe(false);
		});
	});

	describe('BookPostResponseSchema', () => {
		it('accepts valid booking response', () => {
			const result = BookPostResponseSchema.safeParse({
				bookingId: VALID_BOOKING_ID,
				tenantId: VALID_TENANT_ID,
				resourceId: VALID_RESOURCE_ID,
				slotId: VALID_SLOT_ID,
				start: 1704067200000,
				end: 1704070800000,
				paymentStatus: 'NONE',
			});
			expect(result.success).toBe(true);
		});

		it('accepts all payment statuses', () => {
			for (const status of ['NONE', 'PENDING', 'PAID']) {
				const result = BookPostResponseSchema.safeParse({
					bookingId: VALID_BOOKING_ID,
					tenantId: VALID_TENANT_ID,
					resourceId: VALID_RESOURCE_ID,
					slotId: VALID_SLOT_ID,
					start: 1704067200000,
					end: 1704070800000,
					paymentStatus: status,
				});
				expect(result.success).toBe(true);
			}
		});

		it('rejects invalid payment status', () => {
			const result = BookPostResponseSchema.safeParse({
				bookingId: VALID_BOOKING_ID,
				tenantId: VALID_TENANT_ID,
				resourceId: VALID_RESOURCE_ID,
				slotId: VALID_SLOT_ID,
				start: 1704067200000,
				end: 1704070800000,
				paymentStatus: 'INVALID',
			});
			expect(result.success).toBe(false);
		});
	});

	describe('CancelPostRequestBodySchema', () => {
		it('accepts valid cancel request', () => {
			const result = CancelPostRequestBodySchema.safeParse({
				tenantId: VALID_TENANT_ID,
				resourceId: VALID_RESOURCE_ID,
				bookingId: VALID_BOOKING_ID,
			});
			expect(result.success).toBe(true);
		});

		it('rejects invalid bookingId', () => {
			const result = CancelPostRequestBodySchema.safeParse({
				tenantId: VALID_TENANT_ID,
				resourceId: VALID_RESOURCE_ID,
				bookingId: 'invalid',
			});
			expect(result.success).toBe(false);
		});
	});

	describe('CancelPostResponseSchema', () => {
		it('accepts valid cancel response', () => {
			const result = CancelPostResponseSchema.safeParse({
				bookingId: VALID_BOOKING_ID,
				tenantId: VALID_TENANT_ID,
				resourceId: VALID_RESOURCE_ID,
				slotId: VALID_SLOT_ID,
				cancelled: true,
			});
			expect(result.success).toBe(true);
		});
	});

	describe('HealthResponseSchema', () => {
		it('accepts valid health response', () => {
			const result = HealthResponseSchema.safeParse({
				status: 'ok',
				version: '0.1.0',
				timestamp: Date.now(),
			});
			expect(result.success).toBe(true);
		});

		it('accepts degraded status', () => {
			const result = HealthResponseSchema.safeParse({
				status: 'degraded',
				version: '0.1.0',
				timestamp: Date.now(),
			});
			expect(result.success).toBe(true);
		});

		it('rejects invalid status', () => {
			const result = HealthResponseSchema.safeParse({
				status: 'error',
				version: '0.1.0',
				timestamp: Date.now(),
			});
			expect(result.success).toBe(false);
		});
	});

	describe('BookingsPostRequestBodySchema', () => {
		it('accepts request with required fields only', () => {
			const result = BookingsPostRequestBodySchema.safeParse({
				tenantId: VALID_TENANT_ID,
				resourceId: VALID_RESOURCE_ID,
			});
			expect(result.success).toBe(true);
		});

		it('accepts request with all optional fields', () => {
			const result = BookingsPostRequestBodySchema.safeParse({
				tenantId: VALID_TENANT_ID,
				resourceId: VALID_RESOURCE_ID,
				from: '2025-01-15T00:00:00.000Z',
				to: '2025-01-16T00:00:00.000Z',
				status: 'CONFIRMED',
			});
			expect(result.success).toBe(true);
		});

		it('accepts ALL status filter', () => {
			const result = BookingsPostRequestBodySchema.safeParse({
				tenantId: VALID_TENANT_ID,
				resourceId: VALID_RESOURCE_ID,
				status: 'ALL',
			});
			expect(result.success).toBe(true);
		});
	});

	describe('BookingsPostResponseSchema', () => {
		it('accepts valid response with bookings', () => {
			const result = BookingsPostResponseSchema.safeParse({
				bookings: [
					{
						bookingId: VALID_BOOKING_ID,
						slotId: VALID_SLOT_ID,
						start: 1704067200000,
						end: 1704070800000,
						status: 'CONFIRMED',
						customerName: 'John Doe',
						customerEmail: 'john@example.com',
						createdAt: Date.now(),
					},
				],
			});
			expect(result.success).toBe(true);
		});

		it('accepts empty bookings array', () => {
			const result = BookingsPostResponseSchema.safeParse({
				bookings: [],
			});
			expect(result.success).toBe(true);
		});

		it('accepts cancelled booking status', () => {
			const result = BookingsPostResponseSchema.safeParse({
				bookings: [
					{
						bookingId: VALID_BOOKING_ID,
						slotId: VALID_SLOT_ID,
						start: 1704067200000,
						end: 1704070800000,
						status: 'CANCELLED',
						createdAt: Date.now(),
					},
				],
			});
			expect(result.success).toBe(true);
		});
	});

	describe('Offer Schemas', () => {
		describe('WeeklyOfferSchema', () => {
			it('accepts valid weekly offer', () => {
				const result = WeeklyOfferSchema.safeParse({
					tenantId: VALID_TENANT_ID,
					resourceId: VALID_RESOURCE_ID,
					type: 'weekly',
					daysOfWeek: [1, 2, 3, 4, 5],
					startTime: '09:00',
					endTime: '17:00',
				});
				expect(result.success).toBe(true);
			});

			it('accepts weekly offer with all optional fields', () => {
				const result = WeeklyOfferSchema.safeParse({
					id: VALID_BOOKING_ID,
					tenantId: VALID_TENANT_ID,
					resourceId: VALID_RESOURCE_ID,
					type: 'weekly',
					daysOfWeek: [0, 6],
					startTime: '10:00',
					endTime: '18:00',
					timezone: 'America/New_York',
					priceCents: 5000,
					currency: 'USD',
				});
				expect(result.success).toBe(true);
			});

			it('rejects invalid day of week', () => {
				const result = WeeklyOfferSchema.safeParse({
					tenantId: VALID_TENANT_ID,
					resourceId: VALID_RESOURCE_ID,
					type: 'weekly',
					daysOfWeek: [7],
					startTime: '09:00',
					endTime: '17:00',
				});
				expect(result.success).toBe(false);
			});

			it('rejects invalid time format', () => {
				const result = WeeklyOfferSchema.safeParse({
					tenantId: VALID_TENANT_ID,
					resourceId: VALID_RESOURCE_ID,
					type: 'weekly',
					daysOfWeek: [1],
					startTime: '9:00',
					endTime: '17:00',
				});
				expect(result.success).toBe(false);
			});

			it('defaults currency to USD', () => {
				const result = WeeklyOfferSchema.safeParse({
					tenantId: VALID_TENANT_ID,
					resourceId: VALID_RESOURCE_ID,
					type: 'weekly',
					daysOfWeek: [1],
					startTime: '09:00',
					endTime: '17:00',
				});
				expect(result.success).toBe(true);
				if (result.success) {
					expect(result.data.currency).toBe('USD');
				}
			});
		});

		describe('RangeOfferSchema', () => {
			it('accepts valid range offer', () => {
				const result = RangeOfferSchema.safeParse({
					tenantId: VALID_TENANT_ID,
					resourceId: VALID_RESOURCE_ID,
					type: 'range',
					start: '2025-01-15T10:00:00.000Z',
					end: '2025-01-15T14:00:00.000Z',
				});
				expect(result.success).toBe(true);
			});

			it('accepts range offer with all optional fields', () => {
				const result = RangeOfferSchema.safeParse({
					id: VALID_BOOKING_ID,
					tenantId: VALID_TENANT_ID,
					resourceId: VALID_RESOURCE_ID,
					type: 'range',
					start: '2025-06-15T19:00:00.000Z',
					end: '2025-06-15T23:00:00.000Z',
					timezone: 'Europe/Berlin',
					priceCents: 10000,
					currency: 'EUR',
				});
				expect(result.success).toBe(true);
			});

			it('rejects invalid ISO datetime', () => {
				const result = RangeOfferSchema.safeParse({
					tenantId: VALID_TENANT_ID,
					resourceId: VALID_RESOURCE_ID,
					type: 'range',
					start: '2025-01-15',
					end: '2025-01-15T14:00:00.000Z',
				});
				expect(result.success).toBe(false);
			});
		});

		describe('validateRangeOffer', () => {
			it('returns true when start is before end', () => {
				expect(
					validateRangeOffer({
						start: '2025-01-15T10:00:00.000Z',
						end: '2025-01-15T14:00:00.000Z',
					}),
				).toBe(true);
			});

			it('returns false when start is after end', () => {
				expect(
					validateRangeOffer({
						start: '2025-01-15T14:00:00.000Z',
						end: '2025-01-15T10:00:00.000Z',
					}),
				).toBe(false);
			});

			it('returns false when start equals end', () => {
				expect(
					validateRangeOffer({
						start: '2025-01-15T10:00:00.000Z',
						end: '2025-01-15T10:00:00.000Z',
					}),
				).toBe(false);
			});
		});

		describe('OfferSchema (discriminated union)', () => {
			it('correctly discriminates weekly offer', () => {
				const result = OfferSchema.safeParse({
					tenantId: VALID_TENANT_ID,
					resourceId: VALID_RESOURCE_ID,
					type: 'weekly',
					daysOfWeek: [1],
					startTime: '09:00',
					endTime: '17:00',
				});
				expect(result.success).toBe(true);
				if (result.success) {
					expect(result.data.type).toBe('weekly');
				}
			});

			it('correctly discriminates range offer', () => {
				const result = OfferSchema.safeParse({
					tenantId: VALID_TENANT_ID,
					resourceId: VALID_RESOURCE_ID,
					type: 'range',
					start: '2025-01-15T10:00:00.000Z',
					end: '2025-01-15T14:00:00.000Z',
				});
				expect(result.success).toBe(true);
				if (result.success) {
					expect(result.data.type).toBe('range');
				}
			});

			it('rejects invalid type', () => {
				const result = OfferSchema.safeParse({
					tenantId: VALID_TENANT_ID,
					resourceId: VALID_RESOURCE_ID,
					type: 'invalid',
				});
				expect(result.success).toBe(false);
			});
		});

		describe('OffersGetRequestSchema', () => {
			it('accepts valid request', () => {
				const result = OffersGetRequestSchema.safeParse({
					resourceId: VALID_RESOURCE_ID,
				});
				expect(result.success).toBe(true);
			});
		});

		describe('OffersGetResponseSchema', () => {
			it('accepts response with offers', () => {
				const result = OffersGetResponseSchema.safeParse({
					offers: [
						{
							tenantId: VALID_TENANT_ID,
							resourceId: VALID_RESOURCE_ID,
							type: 'weekly',
							daysOfWeek: [1, 2, 3, 4, 5],
							startTime: '09:00',
							endTime: '17:00',
							currency: 'USD',
						},
					],
				});
				expect(result.success).toBe(true);
			});

			it('accepts empty offers array', () => {
				const result = OffersGetResponseSchema.safeParse({
					offers: [],
				});
				expect(result.success).toBe(true);
			});
		});

		describe('OfferCreateRequestSchema', () => {
			it('accepts weekly offer', () => {
				const result = OfferCreateRequestSchema.safeParse({
					tenantId: VALID_TENANT_ID,
					resourceId: VALID_RESOURCE_ID,
					type: 'weekly',
					daysOfWeek: [1, 2, 3, 4, 5],
					startTime: '09:00',
					endTime: '17:00',
				});
				expect(result.success).toBe(true);
			});

			it('accepts range offer', () => {
				const result = OfferCreateRequestSchema.safeParse({
					tenantId: VALID_TENANT_ID,
					resourceId: VALID_RESOURCE_ID,
					type: 'range',
					start: '2025-01-15T10:00:00.000Z',
					end: '2025-01-15T14:00:00.000Z',
				});
				expect(result.success).toBe(true);
			});
		});

		describe('OfferDeleteRequestSchema', () => {
			it('accepts valid delete request', () => {
				const result = OfferDeleteRequestSchema.safeParse({
					offerId: VALID_BOOKING_ID,
				});
				expect(result.success).toBe(true);
			});

			it('rejects invalid offerId', () => {
				const result = OfferDeleteRequestSchema.safeParse({
					offerId: 'invalid',
				});
				expect(result.success).toBe(false);
			});
		});
	});
});
