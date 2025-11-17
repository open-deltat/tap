import { expect, test } from 'bun:test';
import { createCorrelationId, createError } from './create-error';
import { ERROR_VALUES } from './error-values';

test('createError returns TAPError with correct structure', () => {
	const correlationId = createCorrelationId();
	const error = createError(
		ERROR_VALUES.TAP_INVALID_INPUT,
		'Invalid input provided',
		{
			correlationId,
			tenantId: 'tenant_123',
			details: { field: 'day', value: 'invalid' },
		},
	);

	expect(error.errorValue).toBe(ERROR_VALUES.TAP_INVALID_INPUT);
	expect(error.category).toBe('CLIENT_VALIDATION');
	expect(error.httpStatus).toBe(400);
	expect(error.message).toBe('Invalid input provided');
	expect(error.correlationId).toBe(correlationId);
	expect(error.tenantId).toBe('tenant_123');
	expect(error.details).toEqual({ field: 'day', value: 'invalid' });
});

test('createError uses ERROR_META defaults', () => {
	const correlationId = createCorrelationId();
	const error = createError(
		ERROR_VALUES.TAP_SLOT_UNAVAILABLE,
		'Slot unavailable',
		{ correlationId },
	);

	expect(error.category).toBe('CLIENT_CONFLICT');
	expect(error.httpStatus).toBe(409);
});

test('createError allows override of category and httpStatus', () => {
	const correlationId = createCorrelationId();
	const error = createError(
		ERROR_VALUES.TAP_INVALID_INPUT,
		'Test',
		{ correlationId },
		{
			override: {
				category: 'SERVER',
				httpStatus: 500,
			},
		},
	);

	expect(error.category).toBe('SERVER');
	expect(error.httpStatus).toBe(500);
});

test('createError includes cause when provided', () => {
	const correlationId = createCorrelationId();
	const originalError = new Error('Original error');
	const error = createError(
		ERROR_VALUES.TAP_INTERNAL_ERROR,
		'Internal error',
		{ correlationId },
		{ cause: originalError },
	);

	expect(error.cause).toBe(originalError);
});

test('createCorrelationId generates ULID', () => {
	const id = createCorrelationId();
	expect(id).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
	expect(id.length).toBe(26);
});
