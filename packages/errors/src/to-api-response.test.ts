import { expect, test } from 'bun:test';
import { createError } from './create-error';
import { ERROR_VALUES } from './error-values';
import { toAPIErrorResponse } from './to-api-response';

test('toAPIErrorResponse converts TAPError to APIErrorResponse', () => {
	const correlationId = 'req_123';
	const tapError = createError(
		ERROR_VALUES.TAP_SLOT_UNAVAILABLE,
		'Requested time range is no longer available',
		{
			correlationId,
			tenantId: 'tenant_123',
			resourceId: 'resource_456',
			details: { start: '2025-11-18T09:00:00Z', end: '2025-11-18T09:30:00Z' },
		},
	);

	const response = toAPIErrorResponse(tapError);

	expect(response.error.value).toBe(ERROR_VALUES.TAP_SLOT_UNAVAILABLE);
	expect(response.error.httpStatus).toBe(409);
	expect(response.error.message).toBe(
		'Requested time range is no longer available',
	);
	expect(response.error.correlationId).toBe(correlationId);
	expect(response.error.details).toEqual({
		start: '2025-11-18T09:00:00Z',
		end: '2025-11-18T09:30:00Z',
	});
});

test('toAPIErrorResponse excludes cause and internal fields', () => {
	const correlationId = 'req_123';
	const tapError = createError(
		ERROR_VALUES.TAP_INTERNAL_ERROR,
		'Internal error',
		{ correlationId },
		{ cause: new Error('Original error') },
	);

	const response = toAPIErrorResponse(tapError);

	expect(response.error).not.toHaveProperty('cause');
	expect(response.error).not.toHaveProperty('category');
	expect(response.error).not.toHaveProperty('tenantId');
});
