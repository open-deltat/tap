import { describe, expect, it } from 'bun:test';
import {
	AvailabilityPostRequestBodySchema,
	BookPostRequestBodySchema,
	IsoDateTimeSchema,
	MoneyAmountSchema,
	ResourceIdSchema,
	TenantIdSchema,
} from '../src';

describe('Protocol Schemas', () => {
	describe('Primitives', () => {
		it('should validate correct MoneyAmount', () => {
			const valid = { amountCents: 1000, currency: 'USD' };
			const result = MoneyAmountSchema.safeParse(valid);
			expect(result.success).toBe(true);
		});

		it('should reject negative MoneyAmount', () => {
			const invalid = { amountCents: -100, currency: 'USD' };
			const result = MoneyAmountSchema.safeParse(invalid);
			expect(result.success).toBe(false);
		});

		it('should validate ISO DateTime with offset', () => {
			const valid = '2023-10-27T10:00:00Z';
			const result = IsoDateTimeSchema.safeParse(valid);
			expect(result.success).toBe(true);
		});

		it('should reject non-ISO DateTime', () => {
			const invalid = '2023/10/27';
			const result = IsoDateTimeSchema.safeParse(invalid);
			expect(result.success).toBe(false);
		});
	});

	describe('Availability', () => {
		it('should validate correct AvailabilityPostRequestBody', () => {
			const valid = {
				tenantId: '01H8X5QZ4X9Z4Z4Z4Z4Z4Z4Z4Z',
				resourceId: '01H8X5QZ4X9Z4Z4Z4Z4Z4Z4Z4Z',
				from: '2023-10-27T00:00:00Z',
				to: '2023-10-28T00:00:00Z',
				slotDurationMinutes: 30,
			};
			const result = AvailabilityPostRequestBodySchema.safeParse(valid);
			expect(result.success).toBe(true);
		});

		it('should fail with invalid ULID', () => {
			const invalid = {
				tenantId: 'invalid-ulid',
				resourceId: '01H8X5QZ4X9Z4Z4Z4Z4Z4Z4Z4Z',
				from: '2023-10-27T00:00:00Z',
				to: '2023-10-28T00:00:00Z',
			};
			const result = AvailabilityPostRequestBodySchema.safeParse(invalid);
			expect(result.success).toBe(false);
		});
	});

	describe('Booking', () => {
		it('should validate correct BookPostRequestBody', () => {
			const valid = {
				tenantId: '01H8X5QZ4X9Z4Z4Z4Z4Z4Z4Z4Z',
				resourceId: '01H8X5QZ4X9Z4Z4Z4Z4Z4Z4Z4Z',
				slotId: '2023-10-27T10:00:00Z_2023-10-27T11:00:00Z', // Note: SlotId is just a string schema currently
				customer: {
					name: 'John Doe',
					email: 'john@example.com',
					phone: '+1234567890',
				},
			};
			const result = BookPostRequestBodySchema.safeParse(valid);
			expect(result.success).toBe(true);
		});
	});
});

