import { expect, test } from 'bun:test';
import { createCorrelationId } from './create-error';
import { ERROR_VALUES } from './error-values';
import { commonErrors } from './helpers';

test('commonErrors.invalidInput creates client validation error', () => {
	const correlationId = createCorrelationId();
	const error = commonErrors.invalidInput('Invalid day format', {
		correlationId,
	});

	expect(error.errorValue).toBe(ERROR_VALUES.TAP_INVALID_INPUT);
	expect(error.category).toBe('CLIENT_VALIDATION');
	expect(error.httpStatus).toBe(400);
});

test('commonErrors.slotUnavailable creates conflict error', () => {
	const correlationId = createCorrelationId();
	const error = commonErrors.slotUnavailable({
		correlationId,
		tenantId: 'tenant_123',
		resourceId: 'resource_456',
	});

	expect(error.errorValue).toBe(ERROR_VALUES.TAP_SLOT_UNAVAILABLE);
	expect(error.category).toBe('CLIENT_CONFLICT');
	expect(error.httpStatus).toBe(409);
	expect(error.tenantId).toBe('tenant_123');
	expect(error.resourceId).toBe('resource_456');
});

test('commonErrors.concurrencyConflict creates server error', () => {
	const correlationId = createCorrelationId();
	const error = commonErrors.concurrencyConflict('Lost race condition', {
		correlationId,
	});

	expect(error.errorValue).toBe(ERROR_VALUES.TAP_CONCURRENCY_CONFLICT);
	expect(error.category).toBe('SERVER');
	expect(error.httpStatus).toBe(409);
});

test('commonErrors.invariantViolation creates internal invariant error', () => {
	const correlationId = createCorrelationId();
	const error = commonErrors.invariantViolation('Bitmap state inconsistent', {
		correlationId,
	});

	expect(error.errorValue).toBe(ERROR_VALUES.TAP_INVARIANT_VIOLATION);
	expect(error.category).toBe('INTERNAL_INVARIANT');
	expect(error.httpStatus).toBe(500);
});
