import { expect, test } from 'bun:test';
import { ulid } from 'ulid';
import type { BookingId, HoldId, ResourceId, TenantId } from '../domain/ids';
import {
	createBookingCancelledEvent,
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
		day: '2025-12-01',
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
	});

	expect(event.type).toBe('HoldPlaced');
	expect(event.tenantId).toBe(tenantId);
	expect(event.resourceId).toBe(resourceId);
	expect(event.payload.holdId).toBe(holdId);
	expect(event.payload.day).toBe('2025-12-01');
	expect(event.payload.startMinute).toBe(600);
	expect(event.payload.endMinute).toBe(660);
	expect(event.version).toBe(1);
	expect(event.createdAt).toBeGreaterThan(0);
});

test('createHoldPlacedEvent includes optional clientRef', () => {
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const holdId = ulid() as HoldId;

	const event = createHoldPlacedEvent({
		tenantId,
		resourceId,
		holdId,
		day: '2025-12-01',
		startMinute: 600,
		endMinute: 660,
		expiresAt: Date.now() + 60_000,
		clientRef: 'external-ref-123',
	});

	expect(event.payload.clientRef).toBe('external-ref-123');
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
		start: Date.now(),
		end: Date.now() + 3600000,
		customerName: 'John Doe',
		customerEmail: 'john@example.com',
		customerPhone: '+1234567890',
		paymentStatus: 'PAID',
		priceCents: 5000,
	});

	expect(event.type).toBe('BookingConfirmed');
	expect(event.tenantId).toBe(tenantId);
	expect(event.resourceId).toBe(resourceId);
	expect(event.payload.bookingId).toBe(bookingId);
	expect(event.payload.holdId).toBe(holdId);
	expect(event.payload.customerName).toBe('John Doe');
	expect(event.payload.customerEmail).toBe('john@example.com');
	expect(event.payload.customerPhone).toBe('+1234567890');
	expect(event.payload.paymentStatus).toBe('PAID');
	expect(event.payload.priceCents).toBe(5000);
	expect(event.version).toBe(1);
	expect(event.createdAt).toBeGreaterThan(0);
});

test('createBookingCancelledEvent creates valid event', () => {
	const tenantId = ulid() as TenantId;
	const resourceId = ulid() as ResourceId;
	const bookingId = ulid() as BookingId;

	const event = createBookingCancelledEvent({
		tenantId,
		resourceId,
		bookingId,
	});

	expect(event.type).toBe('BookingCancelled');
	expect(event.tenantId).toBe(tenantId);
	expect(event.resourceId).toBe(resourceId);
	expect(event.payload.bookingId).toBe(bookingId);
	expect(event.version).toBe(1);
	expect(event.createdAt).toBeGreaterThan(0);
});
