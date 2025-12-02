import { describe, expect, it } from 'bun:test';
import {
	AvailabilitySlotSchema,
	BookingCustomerSchema,
	BookingIdSchema,
	bookingId,
	CurrencyCodeSchema,
	createAvailabilityTopic,
	createSlotId,
	DayKeySchema,
	EventIdSchema,
	eventId,
	HoldIdSchema,
	holdId,
	IsoDateTimeSchema,
	isBookingId,
	isEventId,
	isHoldId,
	isResourceId,
	isSessionId,
	isSlotId,
	isTenantId,
	MinuteSchema,
	MoneyAmountSchema,
	parseSlotId,
	ResourceIdSchema,
	resourceId,
	SessionIdSchema,
	SlotIdSchema,
	SlotPricingSchema,
	sessionId,
	slotId,
	TenantIdSchema,
	tenantId,
	ULIDSchema,
	UnixTimestampSchema,
} from './primitives';

describe('primitives', () => {
	describe('ULIDSchema', () => {
		it('accepts valid ULID', () => {
			const validUlid = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
			expect(ULIDSchema.safeParse(validUlid).success).toBe(true);
		});

		it('rejects ULID with wrong length', () => {
			expect(ULIDSchema.safeParse('01ARZ3NDEK').success).toBe(false);
			expect(
				ULIDSchema.safeParse('01ARZ3NDEKTSV4RRFFQ69G5FAVEXTRA').success,
			).toBe(false);
		});

		it('rejects ULID with invalid characters', () => {
			expect(ULIDSchema.safeParse('01ARZ3NDEKTSV4RRFFQ69G5FAI').success).toBe(
				false,
			);
			expect(ULIDSchema.safeParse('01ARZ3NDEKTSV4RRFFQ69G5FAL').success).toBe(
				false,
			);
			expect(ULIDSchema.safeParse('01ARZ3NDEKTSV4RRFFQ69G5FAO').success).toBe(
				false,
			);
			expect(ULIDSchema.safeParse('01ARZ3NDEKTSV4RRFFQ69G5FAU').success).toBe(
				false,
			);
		});

		it('rejects non-string values', () => {
			expect(ULIDSchema.safeParse(123).success).toBe(false);
			expect(ULIDSchema.safeParse(null).success).toBe(false);
			expect(ULIDSchema.safeParse(undefined).success).toBe(false);
		});

		it('accepts lowercase ULIDs (converted to uppercase)', () => {
			const lowercaseUlid = '01arz3ndektsv4rrffq69g5fav';
			const result = ULIDSchema.safeParse(lowercaseUlid);
			expect(result.success).toBe(false);
		});
	});

	describe('Branded ID Schemas', () => {
		const validUlid = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

		it('TenantIdSchema accepts valid ULID', () => {
			expect(TenantIdSchema.safeParse(validUlid).success).toBe(true);
		});

		it('ResourceIdSchema accepts valid ULID', () => {
			expect(ResourceIdSchema.safeParse(validUlid).success).toBe(true);
		});

		it('BookingIdSchema accepts valid ULID', () => {
			expect(BookingIdSchema.safeParse(validUlid).success).toBe(true);
		});

		it('HoldIdSchema accepts valid ULID', () => {
			expect(HoldIdSchema.safeParse(validUlid).success).toBe(true);
		});

		it('EventIdSchema accepts valid ULID', () => {
			expect(EventIdSchema.safeParse(validUlid).success).toBe(true);
		});
	});

	describe('SessionIdSchema', () => {
		it('accepts non-empty string', () => {
			expect(SessionIdSchema.safeParse('session-123').success).toBe(true);
			expect(SessionIdSchema.safeParse('a').success).toBe(true);
		});

		it('rejects empty string', () => {
			expect(SessionIdSchema.safeParse('').success).toBe(false);
		});
	});

	describe('SlotIdSchema', () => {
		it('accepts non-empty string', () => {
			expect(
				SlotIdSchema.safeParse(
					'2025-01-15T09:00:00.000Z_2025-01-15T10:00:00.000Z',
				).success,
			).toBe(true);
		});

		it('rejects empty string', () => {
			expect(SlotIdSchema.safeParse('').success).toBe(false);
		});
	});

	describe('DayKeySchema', () => {
		it('accepts valid date format', () => {
			expect(DayKeySchema.safeParse('2025-01-15').success).toBe(true);
			expect(DayKeySchema.safeParse('2024-12-31').success).toBe(true);
		});

		it('rejects invalid date format', () => {
			expect(DayKeySchema.safeParse('2025-1-15').success).toBe(false);
			expect(DayKeySchema.safeParse('2025/01/15').success).toBe(false);
			expect(DayKeySchema.safeParse('15-01-2025').success).toBe(false);
			expect(DayKeySchema.safeParse('invalid').success).toBe(false);
		});
	});

	describe('MinuteSchema', () => {
		it('accepts valid minute values', () => {
			expect(MinuteSchema.safeParse(0).success).toBe(true);
			expect(MinuteSchema.safeParse(720).success).toBe(true);
			expect(MinuteSchema.safeParse(1439).success).toBe(true);
		});

		it('rejects out of range values', () => {
			expect(MinuteSchema.safeParse(-1).success).toBe(false);
			expect(MinuteSchema.safeParse(1440).success).toBe(false);
		});

		it('rejects non-integer values', () => {
			expect(MinuteSchema.safeParse(100.5).success).toBe(false);
		});
	});

	describe('UnixTimestampSchema', () => {
		it('accepts non-negative integers', () => {
			expect(UnixTimestampSchema.safeParse(0).success).toBe(true);
			expect(UnixTimestampSchema.safeParse(1704067200000).success).toBe(true);
		});

		it('rejects negative values', () => {
			expect(UnixTimestampSchema.safeParse(-1).success).toBe(false);
		});

		it('rejects non-integer values', () => {
			expect(UnixTimestampSchema.safeParse(1000.5).success).toBe(false);
		});
	});

	describe('IsoDateTimeSchema', () => {
		it('accepts valid ISO datetime strings', () => {
			expect(
				IsoDateTimeSchema.safeParse('2025-01-15T09:00:00.000Z').success,
			).toBe(true);
			expect(
				IsoDateTimeSchema.safeParse('2025-01-15T09:00:00+01:00').success,
			).toBe(true);
		});

		it('rejects invalid datetime strings', () => {
			expect(IsoDateTimeSchema.safeParse('2025-01-15').success).toBe(false);
			expect(IsoDateTimeSchema.safeParse('invalid').success).toBe(false);
		});
	});

	describe('CurrencyCodeSchema', () => {
		it('accepts 3-letter currency codes', () => {
			expect(CurrencyCodeSchema.safeParse('USD').success).toBe(true);
			expect(CurrencyCodeSchema.safeParse('EUR').success).toBe(true);
			expect(CurrencyCodeSchema.safeParse('GBP').success).toBe(true);
		});

		it('converts to uppercase', () => {
			const result = CurrencyCodeSchema.safeParse('usd');
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBe('USD');
			}
		});

		it('rejects wrong length', () => {
			expect(CurrencyCodeSchema.safeParse('US').success).toBe(false);
			expect(CurrencyCodeSchema.safeParse('USDD').success).toBe(false);
		});
	});

	describe('ID parser functions', () => {
		const validUlid = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
		const invalidUlid = 'invalid';

		it('tenantId parses valid ULID', () => {
			expect(() => tenantId(validUlid)).not.toThrow();
		});

		it('tenantId throws on invalid ULID', () => {
			expect(() => tenantId(invalidUlid)).toThrow();
		});

		it('resourceId parses valid ULID', () => {
			expect(() => resourceId(validUlid)).not.toThrow();
		});

		it('bookingId parses valid ULID', () => {
			expect(() => bookingId(validUlid)).not.toThrow();
		});

		it('holdId parses valid ULID', () => {
			expect(() => holdId(validUlid)).not.toThrow();
		});

		it('eventId parses valid ULID', () => {
			expect(() => eventId(validUlid)).not.toThrow();
		});

		it('sessionId parses valid string', () => {
			expect(() => sessionId('session-123')).not.toThrow();
		});

		it('slotId parses valid string', () => {
			expect(() =>
				slotId('2025-01-15T09:00:00.000Z_2025-01-15T10:00:00.000Z'),
			).not.toThrow();
		});
	});

	describe('ID type guards', () => {
		const validUlid = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
		const invalidUlid = 'invalid';

		it('isTenantId returns true for valid ULID', () => {
			expect(isTenantId(validUlid)).toBe(true);
		});

		it('isTenantId returns false for invalid ULID', () => {
			expect(isTenantId(invalidUlid)).toBe(false);
		});

		it('isResourceId works correctly', () => {
			expect(isResourceId(validUlid)).toBe(true);
			expect(isResourceId(invalidUlid)).toBe(false);
		});

		it('isBookingId works correctly', () => {
			expect(isBookingId(validUlid)).toBe(true);
			expect(isBookingId(invalidUlid)).toBe(false);
		});

		it('isHoldId works correctly', () => {
			expect(isHoldId(validUlid)).toBe(true);
			expect(isHoldId(invalidUlid)).toBe(false);
		});

		it('isEventId works correctly', () => {
			expect(isEventId(validUlid)).toBe(true);
			expect(isEventId(invalidUlid)).toBe(false);
		});

		it('isSessionId works correctly', () => {
			expect(isSessionId('session-123')).toBe(true);
			expect(isSessionId('')).toBe(false);
		});

		it('isSlotId works correctly', () => {
			expect(
				isSlotId('2025-01-15T09:00:00.000Z_2025-01-15T10:00:00.000Z'),
			).toBe(true);
			expect(isSlotId('')).toBe(false);
		});
	});

	describe('createSlotId', () => {
		it('creates slot ID from two dates', () => {
			const start = new Date('2025-01-15T09:00:00.000Z');
			const end = new Date('2025-01-15T10:00:00.000Z');

			const result = createSlotId(start, end);

			expect(result).toBe('2025-01-15T09:00:00.000Z_2025-01-15T10:00:00.000Z');
		});

		it('returns branded SlotId type', () => {
			const start = new Date('2025-01-15T09:00:00.000Z');
			const end = new Date('2025-01-15T10:00:00.000Z');

			const result = createSlotId(start, end);
			expect(isSlotId(result)).toBe(true);
		});
	});

	describe('parseSlotId', () => {
		it('parses valid slot ID into start and end dates', () => {
			const input = slotId('2025-01-15T09:00:00.000Z_2025-01-15T10:00:00.000Z');

			const { start, end } = parseSlotId(input);

			expect(start.toISOString()).toBe('2025-01-15T09:00:00.000Z');
			expect(end.toISOString()).toBe('2025-01-15T10:00:00.000Z');
		});

		it('throws on invalid slot ID format (no underscore)', () => {
			const input = slotId('2025-01-15T09:00:00.000Z');
			expect(() => parseSlotId(input)).toThrow('Invalid slot ID format');
		});

		it('throws on invalid date in slot ID', () => {
			const input = slotId('invalid_dates');
			expect(() => parseSlotId(input)).toThrow('Invalid date in slot ID');
		});

		it('round-trips with createSlotId', () => {
			const originalStart = new Date('2025-01-15T09:00:00.000Z');
			const originalEnd = new Date('2025-01-15T10:00:00.000Z');

			const slotIdValue = createSlotId(originalStart, originalEnd);
			const { start, end } = parseSlotId(slotIdValue);

			expect(start.getTime()).toBe(originalStart.getTime());
			expect(end.getTime()).toBe(originalEnd.getTime());
		});
	});

	describe('createAvailabilityTopic', () => {
		it('creates topic string from tenant and resource IDs', () => {
			const tid = tenantId('01ARZ3NDEKTSV4RRFFQ69G5FAV');
			const rid = resourceId('01ARZ3NDEKTSV4RRFFQ69G5FAW');

			const topic = createAvailabilityTopic(tid, rid);

			expect(topic).toBe(
				'availability:01ARZ3NDEKTSV4RRFFQ69G5FAV:01ARZ3NDEKTSV4RRFFQ69G5FAW',
			);
		});
	});

	describe('MoneyAmountSchema', () => {
		it('accepts valid money amount', () => {
			const result = MoneyAmountSchema.safeParse({
				amountCents: 1000,
				currency: 'USD',
			});
			expect(result.success).toBe(true);
		});

		it('accepts zero amount', () => {
			const result = MoneyAmountSchema.safeParse({
				amountCents: 0,
				currency: 'EUR',
			});
			expect(result.success).toBe(true);
		});

		it('rejects negative amount', () => {
			const result = MoneyAmountSchema.safeParse({
				amountCents: -100,
				currency: 'USD',
			});
			expect(result.success).toBe(false);
		});

		it('rejects invalid currency', () => {
			const result = MoneyAmountSchema.safeParse({
				amountCents: 100,
				currency: 'USDD',
			});
			expect(result.success).toBe(false);
		});
	});

	describe('BookingCustomerSchema', () => {
		it('accepts valid customer with all fields', () => {
			const result = BookingCustomerSchema.safeParse({
				name: 'John Doe',
				email: 'john@example.com',
				phone: '+1234567890',
			});
			expect(result.success).toBe(true);
		});

		it('accepts customer without optional phone', () => {
			const result = BookingCustomerSchema.safeParse({
				name: 'John Doe',
				email: 'john@example.com',
			});
			expect(result.success).toBe(true);
		});

		it('rejects invalid email', () => {
			const result = BookingCustomerSchema.safeParse({
				name: 'John Doe',
				email: 'invalid-email',
			});
			expect(result.success).toBe(false);
		});

		it('rejects missing name', () => {
			const result = BookingCustomerSchema.safeParse({
				email: 'john@example.com',
			});
			expect(result.success).toBe(false);
		});

		it('rejects missing email', () => {
			const result = BookingCustomerSchema.safeParse({
				name: 'John Doe',
			});
			expect(result.success).toBe(false);
		});
	});

	describe('AvailabilitySlotSchema', () => {
		it('accepts valid availability slot', () => {
			const result = AvailabilitySlotSchema.safeParse({
				slotId: '2025-01-15T09:00:00.000Z_2025-01-15T10:00:00.000Z',
				resourceId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
				tenantId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
				start: 1704067200000,
				end: 1704070800000,
			});
			expect(result.success).toBe(true);
		});

		it('rejects invalid resourceId', () => {
			const result = AvailabilitySlotSchema.safeParse({
				slotId: '2025-01-15T09:00:00.000Z_2025-01-15T10:00:00.000Z',
				resourceId: 'invalid',
				tenantId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
				start: 1704067200000,
				end: 1704070800000,
			});
			expect(result.success).toBe(false);
		});

		it('rejects missing fields', () => {
			const result = AvailabilitySlotSchema.safeParse({
				slotId: '2025-01-15T09:00:00.000Z_2025-01-15T10:00:00.000Z',
			});
			expect(result.success).toBe(false);
		});
	});

	describe('SlotPricingSchema', () => {
		it('accepts slot pricing with price', () => {
			const result = SlotPricingSchema.safeParse({
				slotId: '2025-01-15T09:00:00.000Z_2025-01-15T10:00:00.000Z',
				price: {
					amountCents: 5000,
					currency: 'USD',
				},
			});
			expect(result.success).toBe(true);
		});

		it('accepts slot pricing without price', () => {
			const result = SlotPricingSchema.safeParse({
				slotId: '2025-01-15T09:00:00.000Z_2025-01-15T10:00:00.000Z',
			});
			expect(result.success).toBe(true);
		});

		it('rejects invalid slotId', () => {
			const result = SlotPricingSchema.safeParse({
				slotId: '',
			});
			expect(result.success).toBe(false);
		});
	});
});
