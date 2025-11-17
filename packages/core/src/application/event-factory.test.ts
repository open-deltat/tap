import { expect, test } from 'bun:test';
import { ulid } from 'ulid';
import type { BookingId, HoldId, ResourceId, TenantId } from '../domain/ids';
import {
	createBookingConfirmedEvent,
	createHoldPlacedEvent,
} from './event-factory';

test('createHoldPlacedEvent creates valid event', () => {
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const holdId = ulid() as HoldId;

	const event = createHoldPlacedEvent({
		tenantId,
		resourceId,
		holdId,
		day: '2025-12-25',
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
		clientRef: 'test-ref',
	});

	expect(event.type).toBe('HoldPlaced');
	expect(event.tenantId).toBe(tenantId);
	expect(event.resourceId).toBe(resourceId);
	expect(event.payload.holdId).toBe(holdId);
	expect(event.payload.day).toBe('2025-12-25');
	expect(event.payload.startMinute).toBe(600);
	expect(event.payload.endMinute).toBe(660);
	expect(event.payload.clientRef).toBe('test-ref');
	expect(event.version).toBe(1);
});

test('createBookingConfirmedEvent creates valid event', () => {
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const bookingId = ulid() as BookingId;
	const holdId = ulid() as HoldId;

	const event = createBookingConfirmedEvent({
		tenantId,
		resourceId,
		bookingId,
		holdId,
		customerEmail: 'test@example.com',
		priceCents: 5000,
	});

	expect(event.type).toBe('BookingConfirmed');
	expect(event.tenantId).toBe(tenantId);
	expect(event.resourceId).toBe(resourceId);
	expect(event.payload.bookingId).toBe(bookingId);
	expect(event.payload.holdId).toBe(holdId);
	expect(event.payload.customerEmail).toBe('test@example.com');
	expect(event.payload.priceCents).toBe(5000);
	expect(event.version).toBe(1);
});
