import { describe, expect, it } from 'bun:test';
import type { ErrorValue } from '@open-tap/protocol';
import { TapError } from './tap-error';

describe('TapError', () => {
	describe('constructor', () => {
		it('creates error with code and message', () => {
			const error = new TapError('TAP_INVALID_INPUT', 'Invalid request body');

			expect(error.code).toBe('TAP_INVALID_INPUT');
			expect(error.message).toBe('Invalid request body');
			expect(error.name).toBe('TapError');
		});

		it('sets httpStatus based on error code', () => {
			const invalidInput = new TapError('TAP_INVALID_INPUT', 'Bad input');
			expect(invalidInput.httpStatus).toBe(400);

			const notFound = new TapError('TAP_RESOURCE_NOT_FOUND', 'Not found');
			expect(notFound.httpStatus).toBe(404);

			const conflict = new TapError('TAP_SLOT_UNAVAILABLE', 'Slot taken');
			expect(conflict.httpStatus).toBe(409);

			const internal = new TapError('TAP_INTERNAL_ERROR', 'Server error');
			expect(internal.httpStatus).toBe(500);
		});

		it('generates correlationId when not provided', () => {
			const error = new TapError('TAP_INVALID_INPUT', 'Test');

			expect(error.correlationId).toBeDefined();
			expect(error.correlationId.length).toBeGreaterThan(0);
		});

		it('uses provided correlationId', () => {
			const customId = 'custom-correlation-123';
			const error = new TapError(
				'TAP_INVALID_INPUT',
				'Test',
				undefined,
				customId,
			);

			expect(error.correlationId).toBe(customId);
		});

		it('stores details when provided', () => {
			const details = { field: 'email', reason: 'invalid format' };
			const error = new TapError(
				'TAP_INVALID_INPUT',
				'Validation failed',
				details,
			);

			expect(error.details).toEqual(details);
		});

		it('has undefined details when not provided', () => {
			const error = new TapError('TAP_INVALID_INPUT', 'Test');

			expect(error.details).toBeUndefined();
		});
	});

	describe('toJSON', () => {
		it('returns APIErrorResponse format', () => {
			const error = new TapError(
				'TAP_SLOT_UNAVAILABLE',
				'Slot is already held',
			);
			const json = error.toJSON();

			expect(json.error).toBeDefined();
			expect(json.error.value).toBe('TAP_SLOT_UNAVAILABLE');
			expect(json.error.httpStatus).toBe(409);
			expect(json.error.message).toBe('Slot is already held');
			expect(json.error.correlationId).toBe(error.correlationId);
		});

		it('includes details when present', () => {
			const details = { slotId: 'slot-123' };
			const error = new TapError('TAP_SLOT_UNAVAILABLE', 'Slot taken', details);
			const json = error.toJSON();

			expect(json.error.details).toEqual(details);
		});

		it('omits details when not present', () => {
			const error = new TapError('TAP_SLOT_UNAVAILABLE', 'Slot taken');
			const json = error.toJSON();

			expect(json.error.details).toBeUndefined();
		});
	});

	describe('toResponse', () => {
		it('creates Response with correct status code', async () => {
			const error = new TapError(
				'TAP_RESOURCE_NOT_FOUND',
				'Resource not found',
			);
			const response = error.toResponse();

			expect(response.status).toBe(404);
		});

		it('sets Content-Type header to application/json', async () => {
			const error = new TapError('TAP_INVALID_INPUT', 'Bad input');
			const response = error.toResponse();

			expect(response.headers.get('Content-Type')).toBe('application/json');
		});

		it('body contains JSON error response', async () => {
			const error = new TapError('TAP_HOLD_NOT_FOUND', 'Hold not found');
			const response = error.toResponse();
			const body = await response.json();

			expect(body.error.value).toBe('TAP_HOLD_NOT_FOUND');
			expect(body.error.message).toBe('Hold not found');
		});
	});

	describe('error codes coverage', () => {
		const errorCases: Array<{
			code: ErrorValue;
			expectedStatus: number;
		}> = [
			{ code: 'TAP_INVALID_INPUT', expectedStatus: 400 },
			{ code: 'TAP_RESOURCE_NOT_FOUND', expectedStatus: 404 },
			{ code: 'TAP_TENANT_NOT_FOUND', expectedStatus: 404 },
			{ code: 'TAP_SLOT_UNAVAILABLE', expectedStatus: 409 },
			{ code: 'TAP_HOLD_NOT_FOUND', expectedStatus: 404 },
			{ code: 'TAP_HOLD_EXPIRED', expectedStatus: 409 },
			{ code: 'TAP_BOOKING_NOT_FOUND', expectedStatus: 404 },
			{ code: 'TAP_BOOKING_ALREADY_CANCELLED', expectedStatus: 409 },
			{ code: 'TAP_UNAUTHENTICATED', expectedStatus: 401 },
			{ code: 'TAP_UNAUTHORIZED', expectedStatus: 403 },
			{ code: 'TAP_RATE_LIMIT_EXCEEDED', expectedStatus: 429 },
			{ code: 'TAP_CONCURRENCY_CONFLICT', expectedStatus: 409 },
			{ code: 'TAP_STORAGE_FAILURE', expectedStatus: 503 },
			{ code: 'TAP_INTERNAL_ERROR', expectedStatus: 500 },
			{ code: 'TAP_INVARIANT_VIOLATION', expectedStatus: 500 },
			{ code: 'TAP_QUOTA_EXCEEDED', expectedStatus: 429 },
		];

		for (const { code, expectedStatus } of errorCases) {
			it(`${code} maps to HTTP ${expectedStatus}`, () => {
				const error = new TapError(code, 'Test message');
				expect(error.httpStatus).toBe(expectedStatus);
			});
		}
	});

	describe('inheritance', () => {
		it('is instance of Error', () => {
			const error = new TapError('TAP_INVALID_INPUT', 'Test');

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(TapError);
		});

		it('can be caught as Error', () => {
			let caught: Error | null = null;

			try {
				throw new TapError('TAP_INVALID_INPUT', 'Test');
			} catch (e) {
				if (e instanceof Error) {
					caught = e;
				}
			}

			expect(caught).not.toBeNull();
			expect(caught).toBeInstanceOf(TapError);
		});

		it('has stack trace', () => {
			const error = new TapError('TAP_INVALID_INPUT', 'Test');

			expect(error.stack).toBeDefined();
			expect(error.stack).toContain('TapError');
		});
	});
});
