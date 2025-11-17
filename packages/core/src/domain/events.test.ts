import { expect, test } from 'bun:test';
import { ulid } from 'ulid';
import { LedgerEventSchema } from './events';

test('validates HoldPlaced event', () => {
	const event = {
		eventId: ulid(),
		tenantId: ulid(),
		resourceId: ulid(),
		type: 'HoldPlaced' as const,
		version: 1 as const,
		createdAt: Date.now(),
		payload: {
			holdId: ulid(),
			day: '2025-12-01',
			startMinute: 600,
			endMinute: 660,
			expiresAt: Date.now() + 60_000,
		},
	};

	const result = LedgerEventSchema.safeParse(event);
	expect(result.success).toBeTrue();
});

test('validates BookingConfirmed event', () => {
	const event = {
		eventId: ulid(),
		tenantId: ulid(),
		resourceId: ulid(),
		type: 'BookingConfirmed' as const,
		version: 1 as const,
		createdAt: Date.now(),
		payload: {
			bookingId: ulid(),
			holdId: ulid(),
			customerEmail: 'test@example.com',
			priceCents: 5000,
		},
	};

	const result = LedgerEventSchema.safeParse(event);
	expect(result.success).toBeTrue();
});

test('rejects invalid event type', () => {
	const event = {
		eventId: ulid(),
		tenantId: ulid(),
		resourceId: ulid(),
		type: 'InvalidType' as any,
		version: 1,
		createdAt: Date.now(),
		payload: {},
	};

	const result = LedgerEventSchema.safeParse(event);
	expect(result.success).toBeFalse();
});

test('rejects event with invalid startMinute', () => {
	const event = {
		eventId: ulid(),
		tenantId: ulid(),
		resourceId: ulid(),
		type: 'HoldPlaced' as const,
		version: 1 as const,
		createdAt: Date.now(),
		payload: {
			holdId: ulid(),
			day: '2025-12-01',
			startMinute: 1500,
			endMinute: 1600,
			expiresAt: Date.now() + 60_000,
		},
	};

	const result = LedgerEventSchema.safeParse(event);
	expect(result.success).toBeFalse();
});

test('validates ResourceCreated event', () => {
	const event = {
		eventId: ulid(),
		tenantId: ulid(),
		resourceId: ulid(),
		type: 'ResourceCreated' as const,
		version: 1 as const,
		createdAt: Date.now(),
		payload: {
			resource: {
				id: ulid(),
				name: 'Test Resource',
				slug: 'test-resource',
				timezone: 'UTC',
				slotMinutes: '30' as const,
			},
		},
	};

	const result = LedgerEventSchema.safeParse(event);
	expect(result.success).toBeTrue();
});
