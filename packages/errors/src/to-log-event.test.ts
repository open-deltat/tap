import { expect, test } from 'bun:test';
import { createError } from './create-error';
import { ERROR_VALUES } from './error-values';
import { createLogEvent } from './to-log-event';

test('createLogEvent creates log event with required fields', () => {
	const event = createLogEvent({
		level: 'INFO',
		msg: 'Booking confirmed',
		correlationId: 'req_123',
	});

	expect(event.level).toBe('INFO');
	expect(event.msg).toBe('Booking confirmed');
	expect(event.correlationId).toBe('req_123');
	expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

test('createLogEvent includes context fields', () => {
	const event = createLogEvent({
		level: 'INFO',
		msg: 'Test',
		correlationId: 'req_123',
		tenantId: 'tenant_123',
		resourceId: 'resource_456',
		bookingId: 'booking_789',
		holdId: 'hold_abc',
		endpoint: '/v1/bookings',
		method: 'POST',
		ip: '127.0.0.1',
	});

	expect(event.tenantId).toBe('tenant_123');
	expect(event.resourceId).toBe('resource_456');
	expect(event.bookingId).toBe('booking_789');
	expect(event.holdId).toBe('hold_abc');
	expect(event.endpoint).toBe('/v1/bookings');
	expect(event.method).toBe('POST');
	expect(event.ip).toBe('127.0.0.1');
});

test('createLogEvent includes error information when provided', () => {
	const correlationId = 'req_123';
	const tapError = createError(
		ERROR_VALUES.TAP_CONCURRENCY_CONFLICT,
		'Concurrent modification detected',
		{ correlationId },
		{ cause: new Error('Original error') },
	);

	const event = createLogEvent({
		level: 'ERROR',
		msg: 'Booking confirmation failed',
		correlationId,
		error: tapError,
	});

	expect(event.errorValue).toBe(ERROR_VALUES.TAP_CONCURRENCY_CONFLICT);
	expect(event.errorCategory).toBe('SERVER');
	expect(event.httpStatus).toBe(409);
	expect(event.stack).toBeDefined();
});

test('createLogEvent includes extra fields', () => {
	const event = createLogEvent({
		level: 'DEBUG',
		msg: 'Debug info',
		correlationId: 'req_123',
		extra: { duration: 123, retries: 3 },
	});

	expect(event.extra).toEqual({ duration: 123, retries: 3 });
});
